if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbPage_Params {
    themeRev?: number;
    projectName?: string;
    statusMessage?: string;
    canvasVersion?: number;
    selectedFootprintId?: string;
    selectedTrackId?: string;
    selectedViaId?: string;
    selectedZoneId?: string;
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
import { ProteusResizer, ProteusMenuTrigger } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import type { ProteusMenuEntry } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusIcon, ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { PcbLayerId, EventBus, ModuleEvent, exportPcbGerber, exportPcbKiCad, createEmptyPcbDocument, normalizePcbDocument, isCopperLayer } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDrcViolation, ModuleEventPayload, PcbEditorSelectionData } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { PcbToolMode } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import type { PcbEditorImpl } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import type { SchematicEditorImpl } from 'schematic_editor';
import type { BusinessError } from "@ohos:base";
import type common from "@ohos:app.ability.common";
import picker from "@ohos:file.picker";
import fs from "@ohos:file.fs";
import { maximizeAppWindow } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/WindowLaunchUtil";
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
        this.__selectedFootprintId = new ObservedPropertySimplePU('', this, "selectedFootprintId");
        this.__selectedTrackId = new ObservedPropertySimplePU('', this, "selectedTrackId");
        this.__selectedViaId = new ObservedPropertySimplePU('', this, "selectedViaId");
        this.__selectedZoneId = new ObservedPropertySimplePU('', this, "selectedZoneId");
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
            }
            else {
                const sel = payload.data as PcbEditorSelectionData;
                if (sel.footprintIds !== undefined && sel.trackIds !== undefined) {
                    this.selectedFootprintId = sel.footprintIds.length > 0 ? sel.footprintIds[0] : '';
                    this.selectedTrackId = sel.trackIds.length > 0 ? sel.trackIds[0] : '';
                    this.selectedViaId = sel.viaIds !== undefined && sel.viaIds.length > 0 ? sel.viaIds[0] : '';
                    this.selectedZoneId = sel.zoneIds !== undefined && sel.zoneIds.length > 0 ? sel.zoneIds[0] : '';
                }
                else {
                    this.selectedFootprintId = '';
                    this.selectedTrackId = '';
                    this.selectedViaId = '';
                    this.selectedZoneId = '';
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
        this.__selectedFootprintId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedTrackId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedViaId.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedZoneId.purgeDependencyOnElmtId(rmElmtId);
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
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__projectName.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__canvasVersion.aboutToBeDeleted();
        this.__selectedFootprintId.aboutToBeDeleted();
        this.__selectedTrackId.aboutToBeDeleted();
        this.__selectedViaId.aboutToBeDeleted();
        this.__selectedZoneId.aboutToBeDeleted();
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
        this.getEditor().deleteSelected();
        this.selectedFootprintId = '';
        this.selectedTrackId = '';
        this.selectedViaId = '';
        this.selectedZoneId = '';
        this.selectedFootprintInfo = '';
        this.syncPcbToProject();
        this.canvasVersion++;
    }
    private runAutoRoute(): void {
        const result = this.getEditor().runAutoRoute();
        if (result.success && result.data !== undefined) {
            this.syncPcbToProject();
            this.canvasVersion++;
            const d = result.data;
            const hint = d.messages.length > 0 ? d.messages[0] : '';
            this.statusMessage = `自动布线: ${d.netCount} 网络, ${d.trackCount} 段走线${hint.length > 0 ? ' — ' + hint : ''}`;
            this.unsavedChanges = true;
        }
        else {
            this.statusMessage = result.error ?? '自动布线失败';
        }
    }
    private adjustSelectedZonePriority(delta: number): void {
        if (this.selectedZoneId.length === 0) {
            return;
        }
        if (this.getEditor().adjustZonePriority(this.selectedZoneId, delta)) {
            this.syncPcbToProject();
            this.refreshSelectedInfo();
            this.canvasVersion++;
            this.unsavedChanges = true;
        }
    }
    private toggleSelectedZoneThermal(): void {
        if (this.selectedZoneId.length === 0) {
            return;
        }
        const doc = this.getEditor().getDocument();
        if (!doc) {
            return;
        }
        for (const zone of doc.zones) {
            if (zone.id === this.selectedZoneId) {
                this.getEditor().setZoneThermalRelief(this.selectedZoneId, !zone.thermalRelief);
                this.syncPcbToProject();
                this.refreshSelectedInfo();
                this.canvasVersion++;
                this.unsavedChanges = true;
                return;
            }
        }
    }
    private refreshSelectedZoneCutouts(): void {
        if (this.selectedZoneId.length === 0) {
            return;
        }
        if (this.getEditor().refreshZoneCutouts(this.selectedZoneId)) {
            this.syncPcbToProject();
            this.canvasVersion++;
            this.statusMessage = '已刷新覆铜挖空';
            this.unsavedChanges = true;
        }
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
            rows.push({ id: l.id, name: l.name, visible: l.visible, color: l.color });
        }
        this.layerRows = rows;
    }
    private async updateFromSchematic(): Promise<void> {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        editor.rebuildNetPinConnectivity();
        const sch = editor.getDocument();
        if (!sch || sch.components.length === 0) {
            this.statusMessage = '原理图为空，请先放置器件';
            return;
        }
        if (!this.ercGatePassed()) {
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
        }
        else {
            this.statusMessage = result.error ?? '更新失败';
        }
    }
    private runDrc(): void {
        this.drcViolations = this.getEditor().runDrc();
        this.statusMessage = this.drcViolations.length === 0
            ? 'DRC 检查通过'
            : `DRC: ${this.drcViolations.length} 个问题`;
    }
    private async saveProject(): Promise<void> {
        this.syncPcbToProject();
        const path = this.appService.currentProjectPath;
        if (path.length === 0) {
            this.statusMessage = '请先保存工程到文件';
            return;
        }
        const ok = await this.appService.saveProject(path);
        if (ok) {
            this.unsavedChanges = false;
            this.statusMessage = '工程已保存';
        }
        else {
            this.statusMessage = '保存失败';
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
        if (this.toolMode === PcbToolMode.ROUTE && mode !== PcbToolMode.ROUTE) {
            this.routeResetKey++;
        }
        this.toolMode = mode;
        if (mode === PcbToolMode.ROUTE && !isCopperLayer(this.getEditor().getActiveLayer())) {
            this.getEditor().setActiveLayer(PcbLayerId.F_CU);
            this.statusMessage = '走线层已切换为 Front Copper';
        }
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.MENU_BG);
        }, Column);
        this.buildMenuBar.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.layoutWeight(1);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbVerticalToolbar(this, {
                        toolMode: this.toolMode,
                        gridActive: this.gridVisible,
                        onToolSelect: (mode: PcbToolMode) => { this.setToolMode(mode); },
                        onRotate: () => {
                            this.getEditor().rotateSelected(true);
                            this.refreshSelectedInfo();
                            this.syncPcbToProject();
                            this.canvasVersion++;
                            this.statusMessage = '已旋转';
                        },
                        onDelete: () => {
                            this.deleteSelected();
                            this.statusMessage = '已删除';
                        },
                        onUndo: () => {
                            if (this.getEditor().undo()) {
                                this.syncPcbToProject();
                                this.refreshSelectedInfo();
                                this.canvasVersion++;
                                this.statusMessage = '撤销';
                            }
                        },
                        onRedo: () => {
                            if (this.getEditor().redo()) {
                                this.syncPcbToProject();
                                this.refreshSelectedInfo();
                                this.canvasVersion++;
                                this.statusMessage = '重做';
                            }
                        },
                        onFit: () => {
                            this.getEditor().fitBoardInView();
                            this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
                            this.canvasVersion++;
                            this.statusMessage = '适应窗口';
                        },
                        onToggleGrid: () => {
                            this.gridVisible = !this.gridVisible;
                            this.canvasVersion++;
                        },
                        onUpdatePcb: () => { void this.updateFromSchematic(); },
                        onDrc: () => { this.runDrc(); },
                        onAutoRoute: () => { this.runAutoRoute(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 490, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            toolMode: this.toolMode,
                            gridActive: this.gridVisible,
                            onToolSelect: (mode: PcbToolMode) => { this.setToolMode(mode); },
                            onRotate: () => {
                                this.getEditor().rotateSelected(true);
                                this.refreshSelectedInfo();
                                this.syncPcbToProject();
                                this.canvasVersion++;
                                this.statusMessage = '已旋转';
                            },
                            onDelete: () => {
                                this.deleteSelected();
                                this.statusMessage = '已删除';
                            },
                            onUndo: () => {
                                if (this.getEditor().undo()) {
                                    this.syncPcbToProject();
                                    this.refreshSelectedInfo();
                                    this.canvasVersion++;
                                    this.statusMessage = '撤销';
                                }
                            },
                            onRedo: () => {
                                if (this.getEditor().redo()) {
                                    this.syncPcbToProject();
                                    this.refreshSelectedInfo();
                                    this.canvasVersion++;
                                    this.statusMessage = '重做';
                                }
                            },
                            onFit: () => {
                                this.getEditor().fitBoardInView();
                                this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
                                this.canvasVersion++;
                                this.statusMessage = '适应窗口';
                            },
                            onToggleGrid: () => {
                                this.gridVisible = !this.gridVisible;
                                this.canvasVersion++;
                            },
                            onUpdatePcb: () => { void this.updateFromSchematic(); },
                            onDrc: () => { this.runDrc(); },
                            onAutoRoute: () => { this.runAutoRoute(); }
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
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbLayerPanel(this, {
                        layerRows: this.layerRows,
                        activeLayer: this.getEditor().getActiveLayer(),
                        panelWidth: this.leftPanelWidth,
                        onLayerSelect: (id: PcbLayerId) => {
                            this.getEditor().setActiveLayer(id);
                            this.statusMessage = `活动层: ${id}`;
                            this.canvasVersion++;
                        },
                        onVisibilityChange: (id: PcbLayerId, visible: boolean) => {
                            this.getEditor().setLayerVisible(id, visible);
                            this.refreshLayers();
                            this.canvasVersion++;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 536, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            layerRows: this.layerRows,
                            activeLayer: this.getEditor().getActiveLayer(),
                            panelWidth: this.leftPanelWidth,
                            onLayerSelect: (id: PcbLayerId) => {
                                this.getEditor().setActiveLayer(id);
                                this.statusMessage = `活动层: ${id}`;
                                this.canvasVersion++;
                            },
                            onVisibilityChange: (id: PcbLayerId, visible: boolean) => {
                                this.getEditor().setLayerVisible(id, visible);
                                this.refreshLayers();
                                this.canvasVersion++;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        layerRows: this.layerRows,
                        activeLayer: this.getEditor().getActiveLayer(),
                        panelWidth: this.leftPanelWidth
                    });
                }
            }, { name: "PcbLayerPanel" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusResizer(this, { onDrag: (dx: number) => { this.leftPanelWidth = Math.max(140, this.leftPanelWidth + dx); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 552, col: 9 });
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
            __Common__.create();
            __Common__.layoutWeight(1);
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
                            this.selectedFootprintInfo = '';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 554, col: 9 });
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
                                this.selectedFootprintInfo = '';
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
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusResizer(this, { onDrag: (dx: number) => { this.rightPanelWidth = Math.max(180, this.rightPanelWidth - dx); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 584, col: 9 });
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
                        activeLayer: this.getEditor().getActiveLayer(),
                        drcViolations: this.drcViolations,
                        onZonePriority: (delta: number) => { this.adjustSelectedZonePriority(delta); },
                        onZoneThermal: () => { this.toggleSelectedZoneThermal(); },
                        onZoneRefreshCutouts: () => { this.refreshSelectedZoneCutouts(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 586, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            panelWidth: this.rightPanelWidth,
                            selectionInfo: this.selectedFootprintInfo,
                            selectedZoneId: this.selectedZoneId,
                            activeLayer: this.getEditor().getActiveLayer(),
                            drcViolations: this.drcViolations,
                            onZonePriority: (delta: number) => { this.adjustSelectedZonePriority(delta); },
                            onZoneThermal: () => { this.toggleSelectedZoneThermal(); },
                            onZoneRefreshCutouts: () => { this.refreshSelectedZoneCutouts(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        panelWidth: this.rightPanelWidth,
                        selectionInfo: this.selectedFootprintInfo,
                        selectedZoneId: this.selectedZoneId,
                        activeLayer: this.getEditor().getActiveLayer(),
                        drcViolations: this.drcViolations
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
                        activeLayer: this.getEditor().getActiveLayer(),
                        gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
                        gridVisible: this.gridVisible
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 599, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            statusMessage: this.statusMessage,
                            worldX: this.worldMouseX,
                            worldY: this.worldMouseY,
                            zoomPercent: this.zoomPercent,
                            activeLayer: this.getEditor().getActiveLayer(),
                            gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
                            gridVisible: this.gridVisible
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
                        activeLayer: this.getEditor().getActiveLayer(),
                        gridSize: this.getEditor().getDocument()?.metadata.gridSize ?? 5,
                        gridVisible: this.gridVisible
                    });
                }
            }, { name: "PcbStatusBar" });
        }
        Column.pop();
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
                    let componentCall = new ProteusIcon(this, { name: ProteusIconName.LAYER, iconSize: 14, color: ProteusColors.SELECTED }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 617, col: 7 });
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
                    let componentCall = new ProteusMenuTrigger(this, { label: '文件', entries: this.fileMenuEntries() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 623, col: 7 });
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
                    let componentCall = new ProteusMenuTrigger(this, { label: '视图', entries: this.viewMenuEntries() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 624, col: 7 });
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
                    let componentCall = new ProteusMenuTrigger(this, { label: '工具', entries: this.toolMenuEntries() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/PcbPage.ets", line: 625, col: 7 });
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
            { label: '导出 PCB', action: () => { void this.exportPcb(); } },
            { label: '导出 Gerber', action: () => { void this.exportGerber(); } },
            { label: '返回首页', action: () => { this.goToHome(); } }
        ];
    }
    viewMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: '适应窗口 (F)', action: () => {
                    this.getEditor().fitBoardInView();
                    this.zoomPercent = Math.round(this.getEditor().getViewport().zoom * 100);
                    this.canvasVersion++;
                } },
            { label: '切换网格', action: () => { this.gridVisible = !this.gridVisible; this.canvasVersion++; } },
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
