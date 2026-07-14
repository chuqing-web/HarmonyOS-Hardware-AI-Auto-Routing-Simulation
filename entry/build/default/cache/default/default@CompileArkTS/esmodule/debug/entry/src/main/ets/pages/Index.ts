if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface Index_Params {
    projectName?: string;
    simRunning?: boolean;
    simPaused?: boolean;
    simWaveTick?: number;
    statusMessage?: string;
    canvasVersion?: number;
    selectedComponentId?: string;
    searchKeyword?: string;
    componentList?: string[];
    ercCount?: number;
    ercErrors?: ErcError[];
    aiProgress?: number;
    aiStage?: string;
    mouseX?: number;
    mouseY?: number;
    zoomPercent?: number;
    gridVisible?: boolean;
    rulerVisible?: boolean;
    selectedCount?: number;
    selectedWireActive?: boolean;
    navTab?: number;
    leftLibCollapsed?: boolean;
    leftNavCollapsed?: boolean;
    rightCollapsed?: boolean;
    activeRightTab?: number;
    leftPanelWidth?: number;
    rightPanelWidth?: number;
    debugTabHasBadge?: boolean;
    instrTabHasBadge?: boolean;
    categoryNodes?: CategoryNode[];
    themeRefreshKey?: number;
    expandedCategories?: Set<ComponentCategory>;
    selectedTreeItem?: string;
    previewComponentId?: string;
    toolMode?: EditorToolMode;
    showOpenDialog?: boolean;
    openFilePath?: string;
    showSaveAsDialog?: boolean;
    saveAsPath?: string;
    showBurnDialog?: boolean;
    burnFilePath?: string;
    burnMcuFamily?: string;
    burnFirmwareInfo?: string;
    burnSegmentInfo?: string;
    burnEntryPoint?: string;
    burnFileSize?: string;
    wireStartActive?: boolean;
    wireStartX?: number;
    wireStartY?: number;
    navRefreshKey?: number;
    showWelcomeDialog?: boolean;
    showNewProjectDialog?: boolean;
    newProjectNameInput?: string;
    showRecoveryDialog?: boolean;
    recoveryFiles?: string[];
    appInitialized?: boolean;
    unsavedChanges?: boolean;
    showExitConfirmDialog?: boolean;
    clipboardLibId?: string;
    clipboardDeviceIds?: string[];
    userProjectDir?: string;
    modifierKeys?: number;
    appService?: AppService;
    vm?: AppViewModel;
    uiState?: UiStateStore;
    startupRefitDeadline?: number;
    windowResizeHooked?: boolean;
    onSchematicChanged?;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { SchematicCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/SchematicCanvas";
import { PropertyPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/PropertyPanel";
import { McuDebugPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/McuDebugPanel";
import { AiSettingsPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/AiSettingsPanel";
import { PlatformSettingsPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/PlatformSettingsPanel";
import { InstrumentPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/InstrumentPanel";
import { FaultInjectionPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/FaultInjectionPanel";
import { TeachingPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/TeachingPanel";
import { ComponentPreview } from "@bundle:com.elecdraw.aischsim/entry/ets/components/ComponentPreview";
import { ProteusVDivider, ProteusPanelTitle, ProteusNavTab, ProteusTreeRow, ProteusClassicBtn, ProteusSectionTitle, ProteusMenuTrigger, ProteusToolButton, ProteusToolGroup, ProteusResizer, ProteusSidebarTab, ProteusNavCompRow, ProteusNavNetRow, ProteusErcRow } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import type { ProteusMenuEntry } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { UiStateStore } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/UiStateStore";
import { CallbackRegistry, ComponentCategory, EventBus, ModuleEvent, McuFamily, isInstrumentLibraryId, traceBurn, formatFirmwarePreview } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ErcError, ProgressInfo, ComponentInstance, SchematicDocument, ModuleEventPayload } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicEditorImpl, AlignType } from 'schematic_editor';
import { EditorToolMode, toolModeLabel } from "@bundle:com.elecdraw.aischsim/entry/ets/model/EditorToolMode";
import { AppViewModel } from "@bundle:com.elecdraw.aischsim/entry/ets/viewmodel/AppViewModel";
import type common from "@ohos:app.ability.common";
import window from "@ohos:window";
import picker from "@ohos:file.picker";
import { maximizeAppWindow } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/WindowLaunchUtil";
import fs from "@ohos:file.fs";
interface CategoryNode {
    cat: ComponentCategory;
    label: string;
    expanded: boolean;
}
class Index extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__projectName = new ObservedPropertySimplePU('Untitled', this, "projectName");
        this.__simRunning = new ObservedPropertySimplePU(false, this, "simRunning");
        this.__simPaused = new ObservedPropertySimplePU(false, this, "simPaused");
        this.__simWaveTick = new ObservedPropertySimplePU(0, this, "simWaveTick");
        this.__statusMessage = new ObservedPropertySimplePU('', this, "statusMessage");
        this.__canvasVersion = new ObservedPropertySimplePU(0, this, "canvasVersion");
        this.__selectedComponentId = new ObservedPropertySimplePU('', this, "selectedComponentId");
        this.__searchKeyword = new ObservedPropertySimplePU('', this, "searchKeyword");
        this.__componentList = new ObservedPropertyObjectPU([], this, "componentList");
        this.__ercCount = new ObservedPropertySimplePU(0, this, "ercCount");
        this.__ercErrors = new ObservedPropertyObjectPU([], this, "ercErrors");
        this.__aiProgress = new ObservedPropertySimplePU(0, this, "aiProgress");
        this.__aiStage = new ObservedPropertySimplePU('', this, "aiStage");
        this.__mouseX = new ObservedPropertySimplePU(0, this, "mouseX");
        this.__mouseY = new ObservedPropertySimplePU(0, this, "mouseY");
        this.__zoomPercent = new ObservedPropertySimplePU(100, this, "zoomPercent");
        this.__gridVisible = new ObservedPropertySimplePU(true, this, "gridVisible");
        this.__rulerVisible = new ObservedPropertySimplePU(true, this, "rulerVisible");
        this.__selectedCount = new ObservedPropertySimplePU(0, this, "selectedCount");
        this.__selectedWireActive = new ObservedPropertySimplePU(false, this, "selectedWireActive");
        this.__navTab = new ObservedPropertySimplePU(0, this, "navTab");
        this.__leftLibCollapsed = new ObservedPropertySimplePU(false, this, "leftLibCollapsed");
        this.__leftNavCollapsed = new ObservedPropertySimplePU(false, this, "leftNavCollapsed");
        this.__rightCollapsed = new ObservedPropertySimplePU(false, this, "rightCollapsed");
        this.__activeRightTab = new ObservedPropertySimplePU(0, this, "activeRightTab");
        this.__leftPanelWidth = new ObservedPropertySimplePU(240, this, "leftPanelWidth");
        this.__rightPanelWidth = new ObservedPropertySimplePU(300, this, "rightPanelWidth");
        this.__debugTabHasBadge = new ObservedPropertySimplePU(false, this, "debugTabHasBadge");
        this.__instrTabHasBadge = new ObservedPropertySimplePU(false, this, "instrTabHasBadge");
        this.__categoryNodes = new ObservedPropertyObjectPU([], this, "categoryNodes");
        this.__themeRefreshKey = new ObservedPropertySimplePU(0, this, "themeRefreshKey");
        this.__expandedCategories = new ObservedPropertyObjectPU(new Set(), this, "expandedCategories");
        this.__selectedTreeItem = new ObservedPropertySimplePU('', this, "selectedTreeItem");
        this.__previewComponentId = new ObservedPropertySimplePU('', this, "previewComponentId");
        this.__toolMode = new ObservedPropertySimplePU(EditorToolMode.SELECT, this, "toolMode");
        this.__showOpenDialog = new ObservedPropertySimplePU(false, this, "showOpenDialog");
        this.__openFilePath = new ObservedPropertySimplePU('', this, "openFilePath");
        this.__showSaveAsDialog = new ObservedPropertySimplePU(false, this, "showSaveAsDialog");
        this.__saveAsPath = new ObservedPropertySimplePU('', this, "saveAsPath");
        this.__showBurnDialog = new ObservedPropertySimplePU(false, this, "showBurnDialog");
        this.__burnFilePath = new ObservedPropertySimplePU('', this, "burnFilePath");
        this.__burnMcuFamily = new ObservedPropertySimplePU('', this, "burnMcuFamily");
        this.__burnFirmwareInfo = new ObservedPropertySimplePU('', this, "burnFirmwareInfo");
        this.__burnSegmentInfo = new ObservedPropertySimplePU('', this, "burnSegmentInfo");
        this.__burnEntryPoint = new ObservedPropertySimplePU('0x0000', this, "burnEntryPoint");
        this.__burnFileSize = new ObservedPropertySimplePU('', this, "burnFileSize");
        this.__wireStartActive = new ObservedPropertySimplePU(false, this, "wireStartActive");
        this.__wireStartX = new ObservedPropertySimplePU(0, this, "wireStartX");
        this.__wireStartY = new ObservedPropertySimplePU(0, this, "wireStartY");
        this.__navRefreshKey = new ObservedPropertySimplePU(0, this, "navRefreshKey");
        this.__showWelcomeDialog = new ObservedPropertySimplePU(false, this, "showWelcomeDialog");
        this.__showNewProjectDialog = new ObservedPropertySimplePU(false, this, "showNewProjectDialog");
        this.__newProjectNameInput = new ObservedPropertySimplePU('', this, "newProjectNameInput");
        this.__showRecoveryDialog = new ObservedPropertySimplePU(false, this, "showRecoveryDialog");
        this.__recoveryFiles = new ObservedPropertyObjectPU([], this, "recoveryFiles");
        this.__appInitialized = new ObservedPropertySimplePU(false, this, "appInitialized");
        this.__unsavedChanges = new ObservedPropertySimplePU(false, this, "unsavedChanges");
        this.__showExitConfirmDialog = new ObservedPropertySimplePU(false, this, "showExitConfirmDialog");
        this.clipboardLibId = '';
        this.clipboardDeviceIds = [];
        this.userProjectDir = '';
        this.modifierKeys = 0;
        this.appService = AppService.getInstance();
        this.vm = AppViewModel.getInstance(this.appService);
        this.uiState = UiStateStore.getInstance();
        this.startupRefitDeadline = 0;
        this.windowResizeHooked = false;
        this.onSchematicChanged = (_payload: ModuleEventPayload): void => {
            this.navRefreshKey++;
            this.unsavedChanges = true;
            this.canvasVersion++;
        };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: Index_Params) {
        if (params.projectName !== undefined) {
            this.projectName = params.projectName;
        }
        if (params.simRunning !== undefined) {
            this.simRunning = params.simRunning;
        }
        if (params.simPaused !== undefined) {
            this.simPaused = params.simPaused;
        }
        if (params.simWaveTick !== undefined) {
            this.simWaveTick = params.simWaveTick;
        }
        if (params.statusMessage !== undefined) {
            this.statusMessage = params.statusMessage;
        }
        if (params.canvasVersion !== undefined) {
            this.canvasVersion = params.canvasVersion;
        }
        if (params.selectedComponentId !== undefined) {
            this.selectedComponentId = params.selectedComponentId;
        }
        if (params.searchKeyword !== undefined) {
            this.searchKeyword = params.searchKeyword;
        }
        if (params.componentList !== undefined) {
            this.componentList = params.componentList;
        }
        if (params.ercCount !== undefined) {
            this.ercCount = params.ercCount;
        }
        if (params.ercErrors !== undefined) {
            this.ercErrors = params.ercErrors;
        }
        if (params.aiProgress !== undefined) {
            this.aiProgress = params.aiProgress;
        }
        if (params.aiStage !== undefined) {
            this.aiStage = params.aiStage;
        }
        if (params.mouseX !== undefined) {
            this.mouseX = params.mouseX;
        }
        if (params.mouseY !== undefined) {
            this.mouseY = params.mouseY;
        }
        if (params.zoomPercent !== undefined) {
            this.zoomPercent = params.zoomPercent;
        }
        if (params.gridVisible !== undefined) {
            this.gridVisible = params.gridVisible;
        }
        if (params.rulerVisible !== undefined) {
            this.rulerVisible = params.rulerVisible;
        }
        if (params.selectedCount !== undefined) {
            this.selectedCount = params.selectedCount;
        }
        if (params.selectedWireActive !== undefined) {
            this.selectedWireActive = params.selectedWireActive;
        }
        if (params.navTab !== undefined) {
            this.navTab = params.navTab;
        }
        if (params.leftLibCollapsed !== undefined) {
            this.leftLibCollapsed = params.leftLibCollapsed;
        }
        if (params.leftNavCollapsed !== undefined) {
            this.leftNavCollapsed = params.leftNavCollapsed;
        }
        if (params.rightCollapsed !== undefined) {
            this.rightCollapsed = params.rightCollapsed;
        }
        if (params.activeRightTab !== undefined) {
            this.activeRightTab = params.activeRightTab;
        }
        if (params.leftPanelWidth !== undefined) {
            this.leftPanelWidth = params.leftPanelWidth;
        }
        if (params.rightPanelWidth !== undefined) {
            this.rightPanelWidth = params.rightPanelWidth;
        }
        if (params.debugTabHasBadge !== undefined) {
            this.debugTabHasBadge = params.debugTabHasBadge;
        }
        if (params.instrTabHasBadge !== undefined) {
            this.instrTabHasBadge = params.instrTabHasBadge;
        }
        if (params.categoryNodes !== undefined) {
            this.categoryNodes = params.categoryNodes;
        }
        if (params.themeRefreshKey !== undefined) {
            this.themeRefreshKey = params.themeRefreshKey;
        }
        if (params.expandedCategories !== undefined) {
            this.expandedCategories = params.expandedCategories;
        }
        if (params.selectedTreeItem !== undefined) {
            this.selectedTreeItem = params.selectedTreeItem;
        }
        if (params.previewComponentId !== undefined) {
            this.previewComponentId = params.previewComponentId;
        }
        if (params.toolMode !== undefined) {
            this.toolMode = params.toolMode;
        }
        if (params.showOpenDialog !== undefined) {
            this.showOpenDialog = params.showOpenDialog;
        }
        if (params.openFilePath !== undefined) {
            this.openFilePath = params.openFilePath;
        }
        if (params.showSaveAsDialog !== undefined) {
            this.showSaveAsDialog = params.showSaveAsDialog;
        }
        if (params.saveAsPath !== undefined) {
            this.saveAsPath = params.saveAsPath;
        }
        if (params.showBurnDialog !== undefined) {
            this.showBurnDialog = params.showBurnDialog;
        }
        if (params.burnFilePath !== undefined) {
            this.burnFilePath = params.burnFilePath;
        }
        if (params.burnMcuFamily !== undefined) {
            this.burnMcuFamily = params.burnMcuFamily;
        }
        if (params.burnFirmwareInfo !== undefined) {
            this.burnFirmwareInfo = params.burnFirmwareInfo;
        }
        if (params.burnSegmentInfo !== undefined) {
            this.burnSegmentInfo = params.burnSegmentInfo;
        }
        if (params.burnEntryPoint !== undefined) {
            this.burnEntryPoint = params.burnEntryPoint;
        }
        if (params.burnFileSize !== undefined) {
            this.burnFileSize = params.burnFileSize;
        }
        if (params.wireStartActive !== undefined) {
            this.wireStartActive = params.wireStartActive;
        }
        if (params.wireStartX !== undefined) {
            this.wireStartX = params.wireStartX;
        }
        if (params.wireStartY !== undefined) {
            this.wireStartY = params.wireStartY;
        }
        if (params.navRefreshKey !== undefined) {
            this.navRefreshKey = params.navRefreshKey;
        }
        if (params.showWelcomeDialog !== undefined) {
            this.showWelcomeDialog = params.showWelcomeDialog;
        }
        if (params.showNewProjectDialog !== undefined) {
            this.showNewProjectDialog = params.showNewProjectDialog;
        }
        if (params.newProjectNameInput !== undefined) {
            this.newProjectNameInput = params.newProjectNameInput;
        }
        if (params.showRecoveryDialog !== undefined) {
            this.showRecoveryDialog = params.showRecoveryDialog;
        }
        if (params.recoveryFiles !== undefined) {
            this.recoveryFiles = params.recoveryFiles;
        }
        if (params.appInitialized !== undefined) {
            this.appInitialized = params.appInitialized;
        }
        if (params.unsavedChanges !== undefined) {
            this.unsavedChanges = params.unsavedChanges;
        }
        if (params.showExitConfirmDialog !== undefined) {
            this.showExitConfirmDialog = params.showExitConfirmDialog;
        }
        if (params.clipboardLibId !== undefined) {
            this.clipboardLibId = params.clipboardLibId;
        }
        if (params.clipboardDeviceIds !== undefined) {
            this.clipboardDeviceIds = params.clipboardDeviceIds;
        }
        if (params.userProjectDir !== undefined) {
            this.userProjectDir = params.userProjectDir;
        }
        if (params.modifierKeys !== undefined) {
            this.modifierKeys = params.modifierKeys;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.vm !== undefined) {
            this.vm = params.vm;
        }
        if (params.uiState !== undefined) {
            this.uiState = params.uiState;
        }
        if (params.startupRefitDeadline !== undefined) {
            this.startupRefitDeadline = params.startupRefitDeadline;
        }
        if (params.windowResizeHooked !== undefined) {
            this.windowResizeHooked = params.windowResizeHooked;
        }
        if (params.onSchematicChanged !== undefined) {
            this.onSchematicChanged = params.onSchematicChanged;
        }
    }
    updateStateVars(params: Index_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__projectName.purgeDependencyOnElmtId(rmElmtId);
        this.__simRunning.purgeDependencyOnElmtId(rmElmtId);
        this.__simPaused.purgeDependencyOnElmtId(rmElmtId);
        this.__simWaveTick.purgeDependencyOnElmtId(rmElmtId);
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__canvasVersion.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__searchKeyword.purgeDependencyOnElmtId(rmElmtId);
        this.__componentList.purgeDependencyOnElmtId(rmElmtId);
        this.__ercCount.purgeDependencyOnElmtId(rmElmtId);
        this.__ercErrors.purgeDependencyOnElmtId(rmElmtId);
        this.__aiProgress.purgeDependencyOnElmtId(rmElmtId);
        this.__aiStage.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseX.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseY.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomPercent.purgeDependencyOnElmtId(rmElmtId);
        this.__gridVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__rulerVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedCount.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedWireActive.purgeDependencyOnElmtId(rmElmtId);
        this.__navTab.purgeDependencyOnElmtId(rmElmtId);
        this.__leftLibCollapsed.purgeDependencyOnElmtId(rmElmtId);
        this.__leftNavCollapsed.purgeDependencyOnElmtId(rmElmtId);
        this.__rightCollapsed.purgeDependencyOnElmtId(rmElmtId);
        this.__activeRightTab.purgeDependencyOnElmtId(rmElmtId);
        this.__leftPanelWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__rightPanelWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__debugTabHasBadge.purgeDependencyOnElmtId(rmElmtId);
        this.__instrTabHasBadge.purgeDependencyOnElmtId(rmElmtId);
        this.__categoryNodes.purgeDependencyOnElmtId(rmElmtId);
        this.__themeRefreshKey.purgeDependencyOnElmtId(rmElmtId);
        this.__expandedCategories.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedTreeItem.purgeDependencyOnElmtId(rmElmtId);
        this.__previewComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__toolMode.purgeDependencyOnElmtId(rmElmtId);
        this.__showOpenDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__openFilePath.purgeDependencyOnElmtId(rmElmtId);
        this.__showSaveAsDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__saveAsPath.purgeDependencyOnElmtId(rmElmtId);
        this.__showBurnDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__burnFilePath.purgeDependencyOnElmtId(rmElmtId);
        this.__burnMcuFamily.purgeDependencyOnElmtId(rmElmtId);
        this.__burnFirmwareInfo.purgeDependencyOnElmtId(rmElmtId);
        this.__burnSegmentInfo.purgeDependencyOnElmtId(rmElmtId);
        this.__burnEntryPoint.purgeDependencyOnElmtId(rmElmtId);
        this.__burnFileSize.purgeDependencyOnElmtId(rmElmtId);
        this.__wireStartActive.purgeDependencyOnElmtId(rmElmtId);
        this.__wireStartX.purgeDependencyOnElmtId(rmElmtId);
        this.__wireStartY.purgeDependencyOnElmtId(rmElmtId);
        this.__navRefreshKey.purgeDependencyOnElmtId(rmElmtId);
        this.__showWelcomeDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__showNewProjectDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__newProjectNameInput.purgeDependencyOnElmtId(rmElmtId);
        this.__showRecoveryDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__recoveryFiles.purgeDependencyOnElmtId(rmElmtId);
        this.__appInitialized.purgeDependencyOnElmtId(rmElmtId);
        this.__unsavedChanges.purgeDependencyOnElmtId(rmElmtId);
        this.__showExitConfirmDialog.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__projectName.aboutToBeDeleted();
        this.__simRunning.aboutToBeDeleted();
        this.__simPaused.aboutToBeDeleted();
        this.__simWaveTick.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__canvasVersion.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__searchKeyword.aboutToBeDeleted();
        this.__componentList.aboutToBeDeleted();
        this.__ercCount.aboutToBeDeleted();
        this.__ercErrors.aboutToBeDeleted();
        this.__aiProgress.aboutToBeDeleted();
        this.__aiStage.aboutToBeDeleted();
        this.__mouseX.aboutToBeDeleted();
        this.__mouseY.aboutToBeDeleted();
        this.__zoomPercent.aboutToBeDeleted();
        this.__gridVisible.aboutToBeDeleted();
        this.__rulerVisible.aboutToBeDeleted();
        this.__selectedCount.aboutToBeDeleted();
        this.__selectedWireActive.aboutToBeDeleted();
        this.__navTab.aboutToBeDeleted();
        this.__leftLibCollapsed.aboutToBeDeleted();
        this.__leftNavCollapsed.aboutToBeDeleted();
        this.__rightCollapsed.aboutToBeDeleted();
        this.__activeRightTab.aboutToBeDeleted();
        this.__leftPanelWidth.aboutToBeDeleted();
        this.__rightPanelWidth.aboutToBeDeleted();
        this.__debugTabHasBadge.aboutToBeDeleted();
        this.__instrTabHasBadge.aboutToBeDeleted();
        this.__categoryNodes.aboutToBeDeleted();
        this.__themeRefreshKey.aboutToBeDeleted();
        this.__expandedCategories.aboutToBeDeleted();
        this.__selectedTreeItem.aboutToBeDeleted();
        this.__previewComponentId.aboutToBeDeleted();
        this.__toolMode.aboutToBeDeleted();
        this.__showOpenDialog.aboutToBeDeleted();
        this.__openFilePath.aboutToBeDeleted();
        this.__showSaveAsDialog.aboutToBeDeleted();
        this.__saveAsPath.aboutToBeDeleted();
        this.__showBurnDialog.aboutToBeDeleted();
        this.__burnFilePath.aboutToBeDeleted();
        this.__burnMcuFamily.aboutToBeDeleted();
        this.__burnFirmwareInfo.aboutToBeDeleted();
        this.__burnSegmentInfo.aboutToBeDeleted();
        this.__burnEntryPoint.aboutToBeDeleted();
        this.__burnFileSize.aboutToBeDeleted();
        this.__wireStartActive.aboutToBeDeleted();
        this.__wireStartX.aboutToBeDeleted();
        this.__wireStartY.aboutToBeDeleted();
        this.__navRefreshKey.aboutToBeDeleted();
        this.__showWelcomeDialog.aboutToBeDeleted();
        this.__showNewProjectDialog.aboutToBeDeleted();
        this.__newProjectNameInput.aboutToBeDeleted();
        this.__showRecoveryDialog.aboutToBeDeleted();
        this.__recoveryFiles.aboutToBeDeleted();
        this.__appInitialized.aboutToBeDeleted();
        this.__unsavedChanges.aboutToBeDeleted();
        this.__showExitConfirmDialog.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __projectName: ObservedPropertySimplePU<string>;
    get projectName() {
        return this.__projectName.get();
    }
    set projectName(newValue: string) {
        this.__projectName.set(newValue);
    }
    private __simRunning: ObservedPropertySimplePU<boolean>;
    get simRunning() {
        return this.__simRunning.get();
    }
    set simRunning(newValue: boolean) {
        this.__simRunning.set(newValue);
    }
    private __simPaused: ObservedPropertySimplePU<boolean>;
    get simPaused() {
        return this.__simPaused.get();
    }
    set simPaused(newValue: boolean) {
        this.__simPaused.set(newValue);
    }
    private __simWaveTick: ObservedPropertySimplePU<number>;
    get simWaveTick() {
        return this.__simWaveTick.get();
    }
    set simWaveTick(newValue: number) {
        this.__simWaveTick.set(newValue);
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
    private __selectedComponentId: ObservedPropertySimplePU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(newValue: string) {
        this.__selectedComponentId.set(newValue);
    }
    private __searchKeyword: ObservedPropertySimplePU<string>;
    get searchKeyword() {
        return this.__searchKeyword.get();
    }
    set searchKeyword(newValue: string) {
        this.__searchKeyword.set(newValue);
    }
    private __componentList: ObservedPropertyObjectPU<string[]>;
    get componentList() {
        return this.__componentList.get();
    }
    set componentList(newValue: string[]) {
        this.__componentList.set(newValue);
    }
    private __ercCount: ObservedPropertySimplePU<number>;
    get ercCount() {
        return this.__ercCount.get();
    }
    set ercCount(newValue: number) {
        this.__ercCount.set(newValue);
    }
    private __ercErrors: ObservedPropertyObjectPU<ErcError[]>;
    get ercErrors() {
        return this.__ercErrors.get();
    }
    set ercErrors(newValue: ErcError[]) {
        this.__ercErrors.set(newValue);
    }
    private __aiProgress: ObservedPropertySimplePU<number>;
    get aiProgress() {
        return this.__aiProgress.get();
    }
    set aiProgress(newValue: number) {
        this.__aiProgress.set(newValue);
    }
    private __aiStage: ObservedPropertySimplePU<string>;
    get aiStage() {
        return this.__aiStage.get();
    }
    set aiStage(newValue: string) {
        this.__aiStage.set(newValue);
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
    private __zoomPercent: ObservedPropertySimplePU<number>;
    get zoomPercent() {
        return this.__zoomPercent.get();
    }
    set zoomPercent(newValue: number) {
        this.__zoomPercent.set(newValue);
    }
    private __gridVisible: ObservedPropertySimplePU<boolean>;
    get gridVisible() {
        return this.__gridVisible.get();
    }
    set gridVisible(newValue: boolean) {
        this.__gridVisible.set(newValue);
    }
    private __rulerVisible: ObservedPropertySimplePU<boolean>;
    get rulerVisible() {
        return this.__rulerVisible.get();
    }
    set rulerVisible(newValue: boolean) {
        this.__rulerVisible.set(newValue);
    }
    private __selectedCount: ObservedPropertySimplePU<number>;
    get selectedCount() {
        return this.__selectedCount.get();
    }
    set selectedCount(newValue: number) {
        this.__selectedCount.set(newValue);
    }
    private __selectedWireActive: ObservedPropertySimplePU<boolean>;
    get selectedWireActive() {
        return this.__selectedWireActive.get();
    }
    set selectedWireActive(newValue: boolean) {
        this.__selectedWireActive.set(newValue);
    }
    private __navTab: ObservedPropertySimplePU<number>;
    get navTab() {
        return this.__navTab.get();
    }
    set navTab(newValue: number) {
        this.__navTab.set(newValue);
    }
    private __leftLibCollapsed: ObservedPropertySimplePU<boolean>;
    get leftLibCollapsed() {
        return this.__leftLibCollapsed.get();
    }
    set leftLibCollapsed(newValue: boolean) {
        this.__leftLibCollapsed.set(newValue);
    }
    private __leftNavCollapsed: ObservedPropertySimplePU<boolean>;
    get leftNavCollapsed() {
        return this.__leftNavCollapsed.get();
    }
    set leftNavCollapsed(newValue: boolean) {
        this.__leftNavCollapsed.set(newValue);
    }
    private __rightCollapsed: ObservedPropertySimplePU<boolean>;
    get rightCollapsed() {
        return this.__rightCollapsed.get();
    }
    set rightCollapsed(newValue: boolean) {
        this.__rightCollapsed.set(newValue);
    }
    private __activeRightTab: ObservedPropertySimplePU<number>;
    get activeRightTab() {
        return this.__activeRightTab.get();
    }
    set activeRightTab(newValue: number) {
        this.__activeRightTab.set(newValue);
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
    private __debugTabHasBadge: ObservedPropertySimplePU<boolean>;
    get debugTabHasBadge() {
        return this.__debugTabHasBadge.get();
    }
    set debugTabHasBadge(newValue: boolean) {
        this.__debugTabHasBadge.set(newValue);
    }
    private __instrTabHasBadge: ObservedPropertySimplePU<boolean>;
    get instrTabHasBadge() {
        return this.__instrTabHasBadge.get();
    }
    set instrTabHasBadge(newValue: boolean) {
        this.__instrTabHasBadge.set(newValue);
    }
    private __categoryNodes: ObservedPropertyObjectPU<CategoryNode[]>;
    get categoryNodes() {
        return this.__categoryNodes.get();
    }
    set categoryNodes(newValue: CategoryNode[]) {
        this.__categoryNodes.set(newValue);
    }
    private __themeRefreshKey: ObservedPropertySimplePU<number>;
    get themeRefreshKey() {
        return this.__themeRefreshKey.get();
    }
    set themeRefreshKey(newValue: number) {
        this.__themeRefreshKey.set(newValue);
    }
    private __expandedCategories: ObservedPropertyObjectPU<Set<ComponentCategory>>;
    get expandedCategories() {
        return this.__expandedCategories.get();
    }
    set expandedCategories(newValue: Set<ComponentCategory>) {
        this.__expandedCategories.set(newValue);
    }
    private __selectedTreeItem: ObservedPropertySimplePU<string>;
    get selectedTreeItem() {
        return this.__selectedTreeItem.get();
    }
    set selectedTreeItem(newValue: string) {
        this.__selectedTreeItem.set(newValue);
    }
    private __previewComponentId: ObservedPropertySimplePU<string>;
    get previewComponentId() {
        return this.__previewComponentId.get();
    }
    set previewComponentId(newValue: string) {
        this.__previewComponentId.set(newValue);
    }
    private __toolMode: ObservedPropertySimplePU<EditorToolMode>;
    get toolMode() {
        return this.__toolMode.get();
    }
    set toolMode(newValue: EditorToolMode) {
        this.__toolMode.set(newValue);
    }
    private __showOpenDialog: ObservedPropertySimplePU<boolean>;
    get showOpenDialog() {
        return this.__showOpenDialog.get();
    }
    set showOpenDialog(newValue: boolean) {
        this.__showOpenDialog.set(newValue);
    }
    private __openFilePath: ObservedPropertySimplePU<string>;
    get openFilePath() {
        return this.__openFilePath.get();
    }
    set openFilePath(newValue: string) {
        this.__openFilePath.set(newValue);
    }
    private __showSaveAsDialog: ObservedPropertySimplePU<boolean>;
    get showSaveAsDialog() {
        return this.__showSaveAsDialog.get();
    }
    set showSaveAsDialog(newValue: boolean) {
        this.__showSaveAsDialog.set(newValue);
    }
    private __saveAsPath: ObservedPropertySimplePU<string>;
    get saveAsPath() {
        return this.__saveAsPath.get();
    }
    set saveAsPath(newValue: string) {
        this.__saveAsPath.set(newValue);
    }
    private __showBurnDialog: ObservedPropertySimplePU<boolean>;
    get showBurnDialog() {
        return this.__showBurnDialog.get();
    }
    set showBurnDialog(newValue: boolean) {
        this.__showBurnDialog.set(newValue);
    }
    private __burnFilePath: ObservedPropertySimplePU<string>;
    get burnFilePath() {
        return this.__burnFilePath.get();
    }
    set burnFilePath(newValue: string) {
        this.__burnFilePath.set(newValue);
    }
    private __burnMcuFamily: ObservedPropertySimplePU<string>;
    get burnMcuFamily() {
        return this.__burnMcuFamily.get();
    }
    set burnMcuFamily(newValue: string) {
        this.__burnMcuFamily.set(newValue);
    }
    private __burnFirmwareInfo: ObservedPropertySimplePU<string>;
    get burnFirmwareInfo() {
        return this.__burnFirmwareInfo.get();
    }
    set burnFirmwareInfo(newValue: string) {
        this.__burnFirmwareInfo.set(newValue);
    }
    private __burnSegmentInfo: ObservedPropertySimplePU<string>;
    get burnSegmentInfo() {
        return this.__burnSegmentInfo.get();
    }
    set burnSegmentInfo(newValue: string) {
        this.__burnSegmentInfo.set(newValue);
    }
    private __burnEntryPoint: ObservedPropertySimplePU<string>;
    get burnEntryPoint() {
        return this.__burnEntryPoint.get();
    }
    set burnEntryPoint(newValue: string) {
        this.__burnEntryPoint.set(newValue);
    }
    private __burnFileSize: ObservedPropertySimplePU<string>;
    get burnFileSize() {
        return this.__burnFileSize.get();
    }
    set burnFileSize(newValue: string) {
        this.__burnFileSize.set(newValue);
    }
    private __wireStartActive: ObservedPropertySimplePU<boolean>;
    get wireStartActive() {
        return this.__wireStartActive.get();
    }
    set wireStartActive(newValue: boolean) {
        this.__wireStartActive.set(newValue);
    }
    private __wireStartX: ObservedPropertySimplePU<number>;
    get wireStartX() {
        return this.__wireStartX.get();
    }
    set wireStartX(newValue: number) {
        this.__wireStartX.set(newValue);
    }
    private __wireStartY: ObservedPropertySimplePU<number>;
    get wireStartY() {
        return this.__wireStartY.get();
    }
    set wireStartY(newValue: number) {
        this.__wireStartY.set(newValue);
    }
    private __navRefreshKey: ObservedPropertySimplePU<number>;
    get navRefreshKey() {
        return this.__navRefreshKey.get();
    }
    set navRefreshKey(newValue: number) {
        this.__navRefreshKey.set(newValue);
    }
    private __showWelcomeDialog: ObservedPropertySimplePU<boolean>;
    get showWelcomeDialog() {
        return this.__showWelcomeDialog.get();
    }
    set showWelcomeDialog(newValue: boolean) {
        this.__showWelcomeDialog.set(newValue);
    }
    private __showNewProjectDialog: ObservedPropertySimplePU<boolean>;
    get showNewProjectDialog() {
        return this.__showNewProjectDialog.get();
    }
    set showNewProjectDialog(newValue: boolean) {
        this.__showNewProjectDialog.set(newValue);
    }
    private __newProjectNameInput: ObservedPropertySimplePU<string>;
    get newProjectNameInput() {
        return this.__newProjectNameInput.get();
    }
    set newProjectNameInput(newValue: string) {
        this.__newProjectNameInput.set(newValue);
    }
    private __showRecoveryDialog: ObservedPropertySimplePU<boolean>;
    get showRecoveryDialog() {
        return this.__showRecoveryDialog.get();
    }
    set showRecoveryDialog(newValue: boolean) {
        this.__showRecoveryDialog.set(newValue);
    }
    private __recoveryFiles: ObservedPropertyObjectPU<string[]>;
    get recoveryFiles() {
        return this.__recoveryFiles.get();
    }
    set recoveryFiles(newValue: string[]) {
        this.__recoveryFiles.set(newValue);
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
    private __showExitConfirmDialog: ObservedPropertySimplePU<boolean>;
    get showExitConfirmDialog() {
        return this.__showExitConfirmDialog.get();
    }
    set showExitConfirmDialog(newValue: boolean) {
        this.__showExitConfirmDialog.set(newValue);
    }
    private clipboardLibId: string;
    private clipboardDeviceIds: string[];
    private userProjectDir: string;
    private modifierKeys: number;
    private appService: AppService;
    private vm: AppViewModel;
    private uiState: UiStateStore;
    async aboutToAppear(): Promise<void> {
        const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
        this.appService.initPlatform(ctx);
        this.userProjectDir = this.appService.getUserProjectDir();
        this.vm.bindCallbacks();
        this.appService.onStatusMessage = (msg: string) => { this.statusMessage = msg; };
        this.appService.onErcUpdate = (errors: ErcError[]) => {
            this.ercCount = errors.length;
            this.ercErrors = errors;
        };
        this.appService.onAiProgress = (p: ProgressInfo) => {
            this.aiProgress = p.progress;
            this.aiStage = p.stage;
        };
        this.appService.onProjectChanged = () => {
            this.projectName = this.appService.currentProject?.name ?? 'Untitled';
            this.canvasVersion++;
        };
        this.appService.onWaveUpdate = (_waves) => {
            this.simWaveTick++;
        };
        CallbackRegistry.getInstance().onSelectionChange((devs) => {
            this.selectedCount = devs.length;
            const nets = this.appService.schematicEditor.getSelectedNets();
            this.selectedWireActive = nets.length > 0;
            if (devs.length > 0) {
                this.selectedComponentId = devs[0].instUuid;
                this.updateContextualTabs(devs[0].instUuid);
            }
            else if (!this.selectedWireActive) {
                this.selectedComponentId = '';
                this.debugTabHasBadge = false;
                this.instrTabHasBadge = false;
            }
            else {
                this.selectedComponentId = '';
            }
        });
        EventBus.getInstance().subscribe(ModuleEvent.SCHEMATIC_CHANGED, this.onSchematicChanged);
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STARTED, () => {
            this.simRunning = true;
            this.lockEditingForSimulation();
        });
        EventBus.getInstance().subscribe(ModuleEvent.SIMULATION_STOPPED, () => {
            this.simRunning = false;
            this.simPaused = false;
        });
        this.loadUiState();
        this.initCategoryTree();
        this.hookStartupWindowResize();
        void maximizeAppWindow(ctx);
        // Check for crash recovery files
        this.recoveryFiles = await this.appService.checkRecoveryFiles();
        if (this.recoveryFiles.length > 0) {
            this.appService.newProject('Untitled');
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/Untitled.schsim`, 120000);
            this.showRecoveryDialog = true;
            this.appInitialized = true;
            this.statusMessage = '检测到未正常关闭的工程，是否恢复？';
            return;
        }
        // Check last session
        const session = await this.appService.loadSession();
        if (session !== null && session.lastPath.length > 0) {
            const autoSavePath = `${this.appService.getAutosaveDir()}/${session.lastProjectName}.schsim`;
            if (session.closedCleanly) {
                // Normal last session — try to auto-open
                let ok = await this.appService.loadProject(session.lastPath);
                if (!ok && session.lastPath !== autoSavePath) {
                    // content:// URI from file picker may have expired — fall back to auto-save
                    ok = await this.appService.loadProject(autoSavePath);
                }
                if (ok) {
                    this.projectName = this.appService.currentProject?.name ?? session.lastProjectName;
                    this.appService.enableAutoSave(autoSavePath, 120000);
                    this.resetAfterProjectChange();
                    this.refreshComponentList();
                    this.deferCanvasFit();
                    this.appInitialized = true;
                    this.statusMessage = `已恢复上次工程: ${this.projectName}`;
                    return;
                }
            }
            else {
                // Last session was not cleanly closed — check recovery
                const ok = await this.appService.loadProject(autoSavePath);
                if (ok) {
                    this.projectName = this.appService.currentProject?.name ?? session.lastProjectName;
                    this.appService.enableAutoSave(autoSavePath, 120000);
                    this.resetAfterProjectChange();
                    this.refreshComponentList();
                    this.deferCanvasFit();
                    this.appInitialized = true;
                    this.statusMessage = `已从自动保存恢复: ${this.projectName}`;
                    return;
                }
            }
        }
        // No recovery, no last session — show welcome dialog
        this.appService.newProject('Untitled');
        this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/Untitled.schsim`, 120000);
        this.refreshComponentList();
        this.deferCanvasFit();
        this.appInitialized = true;
        this.showWelcomeDialog = true;
        this.statusMessage = '欢迎使用 AI 原理图仿真 — 请新建或打开工程';
    }
    onPageHide(): void {
        // Save recovery cache when page is hidden (app going to background)
        void this.appService.saveRecoveryCache();
    }
    aboutToDisappear(): void {
        // Save session state before exit — marks last project for auto-reload on next launch
        void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, !this.unsavedChanges // true = clean shutdown, next launch auto-loads; false = may trigger recovery
        );
    }
    onBackPress(): boolean {
        if (this.unsavedChanges) {
            this.showExitConfirmDialog = true;
            return true; // consume the back event, keep app open
        }
        void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
        return false; // allow system to proceed with exit
    }
    loadUiState(): void {
        const s = this.uiState;
        this.leftLibCollapsed = s.leftLibCollapsed;
        this.leftNavCollapsed = s.leftNavCollapsed;
        this.rightCollapsed = s.rightCollapsed;
        this.activeRightTab = s.activeRightTab;
        this.leftPanelWidth = s.leftPanelWidth;
        this.rightPanelWidth = s.rightPanelWidth;
        this.gridVisible = s.gridVisible;
        this.rulerVisible = s.rulerVisible;
        this.toolMode = s.toolMode;
        this.expandedCategories = s.getExpandedCategories();
    }
    persistUiState(): void {
        const s = this.uiState;
        s.leftLibCollapsed = this.leftLibCollapsed;
        s.leftNavCollapsed = this.leftNavCollapsed;
        s.rightCollapsed = this.rightCollapsed;
        s.activeRightTab = this.activeRightTab;
        s.leftPanelWidth = this.leftPanelWidth;
        s.rightPanelWidth = this.rightPanelWidth;
        s.gridVisible = this.gridVisible;
        s.rulerVisible = this.rulerVisible;
        s.toolMode = this.toolMode;
        s.setExpandedCategories(this.expandedCategories);
    }
    updateContextualTabs(instUuid: string): void {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === instUuid);
        if (!comp)
            return;
        const lib = comp.libraryId.toUpperCase();
        const isMcu = lib.startsWith('STM32') || lib.startsWith('8051') || lib.startsWith('AT89') || lib.startsWith('AVR');
        const isInstr = isInstrumentLibraryId(comp.libraryId);
        this.debugTabHasBadge = isMcu;
        this.instrTabHasBadge = isInstr;
        if (isMcu) {
            this.activeRightTab = 3;
        }
        else if (isInstr) {
            this.activeRightTab = 4;
        }
    }
    private toggleSimPause(): void {
        if (!this.simRunning) {
            return;
        }
        this.simPaused = this.appService.toggleSimulationPause();
        this.statusMessage = this.simPaused ? '仿真已暂停' : '仿真已恢复';
    }
    initCategoryTree(): void {
        const cats = this.appService.componentLibrary.getCategories();
        const labels: Map<ComponentCategory, string> = new Map([
            [ComponentCategory.PASSIVE, 'Passive'],
            [ComponentCategory.DISCRETE, 'Discrete'],
            [ComponentCategory.ANALOG_IC, 'Analog IC'],
            [ComponentCategory.DIGITAL_IC, 'Digital IC'],
            [ComponentCategory.MEMORY, 'Memory'],
            [ComponentCategory.SENSOR, 'Sensor'],
            [ComponentCategory.PERIPHERAL, 'Peripheral'],
            [ComponentCategory.MCU_8051, '8051 MCU'],
            [ComponentCategory.MCU_STM32, 'STM32 MCU'],
            [ComponentCategory.INSTRUMENT, 'Instrument'],
            [ComponentCategory.POWER_SUPPLY, 'Power Supply']
        ]);
        const nodes: CategoryNode[] = [];
        const expanded = new Set<ComponentCategory>();
        for (let i = 0; i < cats.length; i++) {
            const cat = cats[i];
            nodes.push({ cat: cat, label: labels.get(cat) ?? cat, expanded: false });
            if (i === 0) {
                expanded.add(cat);
            }
        }
        this.categoryNodes = nodes;
        this.expandedCategories = expanded;
    }
    toggleCategory(cat: ComponentCategory): void {
        const copy = new Set(this.expandedCategories);
        if (copy.has(cat)) {
            copy.delete(cat);
        }
        else {
            copy.add(cat);
        }
        this.expandedCategories = copy;
    }
    refreshComponentList(): void {
        const kw = this.searchKeyword.trim();
        if (kw.length > 0) {
            const result = this.appService.componentLibrary.search(kw, 1, 50);
            this.componentList = result.items.map(c => `${c.id}|${c.name}`);
        }
        else {
            this.componentList = [];
        }
    }
    bumpCanvas(): void {
        this.canvasVersion++;
        this.navRefreshKey++;
    }
    private startupRefitDeadline: number;
    private windowResizeHooked: boolean;
    /** Wait until canvas reports real size, then fit — avoids 800×600 fallback mis-centering. */
    private deferCanvasFit(attempt: number = 0): void {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        if (editor.isCanvasViewReady()) {
            editor.fitAllInView();
            this.bumpCanvas();
            return;
        }
        if (attempt < 30) {
            setTimeout(() => this.deferCanvasFit(attempt + 1), 50);
        }
    }
    private hookStartupWindowResize(): void {
        if (this.windowResizeHooked) {
            return;
        }
        this.windowResizeHooked = true;
        this.startupRefitDeadline = Date.now() + 4000;
        const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
        window.getLastWindow(ctx).then((win) => {
            win.on('windowSizeChange', () => {
                if (Date.now() > this.startupRefitDeadline) {
                    return;
                }
                this.deferCanvasFit();
            });
        }).catch(() => { });
    }
    onPageShow(): void {
        const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
        void maximizeAppWindow(ctx);
        this.hookStartupWindowResize();
        this.deferCanvasFit();
    }
    resetAfterProjectChange(): void {
        this.selectedComponentId = '';
        this.selectedCount = 0;
        this.selectedTreeItem = '';
        this.previewComponentId = '';
        this.wireStartActive = false;
        this.wireStartX = 0;
        this.wireStartY = 0;
        this.toolMode = EditorToolMode.SELECT;
        this.unsavedChanges = false;
        this.bumpCanvas();
    }
    private lockEditingForSimulation(): void {
        if (this.toolMode === EditorToolMode.WIRE || this.toolMode === EditorToolMode.BUS) {
            this.toolMode = EditorToolMode.SELECT;
            this.uiState.toolMode = EditorToolMode.SELECT;
        }
        this.wireStartActive = false;
        this.wireStartX = 0;
        this.wireStartY = 0;
        this.bumpCanvas();
    }
    private applySimStartResult(ok: boolean): void {
        this.simRunning = ok;
        if (ok) {
            this.lockEditingForSimulation();
        }
    }
    setToolMode(mode: EditorToolMode, pendingId: string = ''): void {
        if (this.simRunning && (mode === EditorToolMode.WIRE || mode === EditorToolMode.BUS)) {
            this.statusMessage = '仿真运行中，无法接线';
            return;
        }
        this.toolMode = mode;
        this.wireStartActive = false;
        this.wireStartX = 0;
        this.wireStartY = 0;
        if (pendingId.length > 0) {
            this.previewComponentId = pendingId;
        }
        else if (mode === EditorToolMode.PLACE && this.previewComponentId.length === 0 &&
            this.selectedTreeItem.length > 0) {
            this.previewComponentId = this.selectedTreeItem.split('|')[0];
        }
        if (mode === EditorToolMode.PLACE) {
            if (this.previewComponentId.length > 0) {
                this.statusMessage = `Placing: ${this.previewComponentId}`;
            }
            else {
                this.statusMessage = 'Click on canvas to place component';
            }
        }
        else {
            this.statusMessage = `Mode: ${toolModeLabel(mode)}`;
        }
        this.uiState.toolMode = mode;
        this.bumpCanvas();
    }
    selectLibraryItem(item: string): void {
        this.selectedTreeItem = item;
        this.previewComponentId = item.split('|')[0];
        this.setToolMode(EditorToolMode.PLACE, this.previewComponentId);
    }
    handleNewProject(): void {
        this.showWelcomeDialog = false;
        this.showOpenDialog = false;
        this.showSaveAsDialog = false;
        this.newProjectNameInput = '';
        this.showNewProjectDialog = true;
    }
    doCreateNewProject(): void {
        const name = this.newProjectNameInput.trim().length > 0 ? this.newProjectNameInput.trim() : 'Untitled';
        this.showNewProjectDialog = false;
        this.showWelcomeDialog = false;
        this.appService.disableAutoSave();
        this.appService.newProject(name);
        this.projectName = name;
        this.resetAfterProjectChange();
        this.refreshComponentList();
        this.appService.schematicEditor.fitAllInView();
        const projectPath = `${this.userProjectDir}/${name}.schsim`;
        const autoSavePath = `${this.appService.getAutosaveDir()}/${name}.schsim`;
        void this.appService.saveProject(projectPath).then((saved) => {
            if (saved) {
                this.appService.currentProjectPath = projectPath;
                this.statusMessage = `已创建: ${projectPath}`;
            }
        });
        this.appService.enableAutoSave(autoSavePath, 120000);
        this.appService.currentProjectPath = projectPath;
    }
    async handleOpenProject(): Promise<void> {
        this.showWelcomeDialog = false;
        const sandboxProjects = this.appService.listUserProjectFiles();
        const recents = this.appService.filePersistence.getRecentFiles();
        if (sandboxProjects.length > 0) {
            this.openFilePath = sandboxProjects[sandboxProjects.length - 1];
        }
        else if (recents.length > 0) {
            this.openFilePath = recents[0];
        }
        else {
            this.openFilePath = `${this.userProjectDir}/Untitled.schsim`;
        }
        this.showOpenDialog = true;
        this.showSaveAsDialog = false;
    }
    async handleOpenFromPicker(): Promise<void> {
        try {
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = 1;
            options.fileSuffixFilters = ['.schsim', '.json'];
            const docPicker = new picker.DocumentViewPicker();
            const uris = await docPicker.select(options);
            if (uris && uris.length > 0) {
                const ok = await this.appService.loadProject(uris[0]);
                if (ok) {
                    this.projectName = this.appService.currentProject?.name ?? this.projectName;
                    const name = this.projectName;
                    this.appService.disableAutoSave();
                    this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`, 120000);
                    this.resetAfterProjectChange();
                    this.appService.schematicEditor.fitAllInView();
                    this.refreshComponentList();
                    await this.appService.saveSession(uris[0], name, false);
                    this.statusMessage = `已加载: ${uris[0]}`;
                    return;
                }
            }
        }
        catch (_e) {
            this.statusMessage = '文件选择器不可用';
        }
    }
    async doOpenFromPath(): Promise<void> {
        this.showOpenDialog = false;
        this.showWelcomeDialog = false;
        if (this.openFilePath.trim().length === 0) {
            this.statusMessage = '请输入文件路径';
            return;
        }
        const path = this.openFilePath.trim();
        const ok = await this.appService.loadProject(path);
        if (ok) {
            this.projectName = this.appService.currentProject?.name ?? this.projectName;
            const name = this.projectName;
            this.appService.disableAutoSave();
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`, 120000);
            this.resetAfterProjectChange();
            this.appService.schematicEditor.fitAllInView();
            this.refreshComponentList();
            await this.appService.saveSession(path, name, false);
            this.statusMessage = `已加载: ${path}`;
        }
        else {
            this.statusMessage = `无法打开: ${path}`;
        }
    }
    async handleSaveProject(): Promise<void> {
        const path = this.appService.currentProjectPath;
        if (path.length > 0) {
            const ok = await this.appService.saveProject(path);
            if (ok) {
                // Also sync auto-save so recovery works even if picker URI expires
                const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
                void this.appService.saveProject(autoPath);
                await this.appService.saveSession(path, this.projectName, false);
                this.unsavedChanges = false;
            }
            this.statusMessage = ok ? `已保存: ${path}` : '保存失败';
            return;
        }
        await this.handleSaveAs();
    }
    async handleSaveAs(): Promise<void> {
        try {
            const options = new picker.DocumentSaveOptions();
            options.newFileNames = [`${this.projectName}.schsim`];
            options.fileSuffixChoices = ['schsim', 'json'];
            const docPicker = new picker.DocumentViewPicker();
            const uris = await docPicker.save(options);
            if (uris && uris.length > 0) {
                const ok = await this.appService.saveProject(uris[0]);
                if (ok) {
                    // Sync auto-save to keep recovery path current
                    const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
                    void this.appService.saveProject(autoPath);
                    await this.appService.saveSession(uris[0], this.projectName, false);
                    this.unsavedChanges = false;
                }
                this.statusMessage = ok ? `已保存: ${uris[0]}` : '保存失败';
                return;
            }
        }
        catch (_e) {
            // File picker not available, show manual dialog
        }
        this.saveAsPath = `${this.userProjectDir}/${this.projectName}.schsim`;
        this.showSaveAsDialog = true;
        this.showOpenDialog = false;
    }
    async doSaveAsFromPath(): Promise<void> {
        this.showSaveAsDialog = false;
        if (this.saveAsPath.trim().length === 0) {
            this.statusMessage = '请输入保存路径';
            return;
        }
        const path = this.saveAsPath.trim();
        const ok = await this.appService.saveProject(path);
        if (ok) {
            await this.appService.saveSession(path, this.projectName, false);
            this.unsavedChanges = false;
        }
        this.statusMessage = ok ? `已保存: ${path}` : '保存失败';
    }
    async doBurnHex(): Promise<void> {
        const path = this.burnFilePath.trim();
        if (path.length === 0) {
            this.statusMessage = '请选择或输入 HEX 文件路径';
            traceBurn('UI_BURN_ABORT', 'empty path (toolbar dialog)');
            return;
        }
        traceBurn('UI_BURN_BEGIN', `source=toolbar path=${path} family=${this.burnMcuFamily}`);
        try {
            const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(path);
            const buffer = new ArrayBuffer(stat.size);
            fs.readSync(fileHandle.fd, buffer);
            fs.closeSync(fileHandle);
            const hexView = new Uint8Array(buffer);
            traceBurn('UI_BURN_READ', `path=${path} size=${stat.size} preview=${formatFirmwarePreview(hexView)}`);
            const family = this.burnMcuFamily === '8051' ? McuFamily.MCU_8051 : McuFamily.MCU_STM32F1;
            const result = this.appService.hexDebugger.loadHexData(hexView, family);
            if (result.success && result.data !== undefined) {
                this.appService.loadMcuIntoSim(result.data.data, 0, this.burnMcuFamily);
                const parsed = this.appService.hexDebugger.getParsedHexInfo();
                if (parsed) {
                    this.burnFileSize = `${(stat.size / 1024).toFixed(1)} KB`;
                    const segCount = parsed.flashSegments.length;
                    this.burnSegmentInfo = `${segCount} 段`;
                    const entry = parsed.minAddr;
                    this.burnEntryPoint = `0x${entry.toString(16).toUpperCase().padStart(4, '0')}`;
                    this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}, ${this.burnSegmentInfo}, 入口 ${this.burnEntryPoint}`;
                    traceBurn('UI_BURN_OK', `source=toolbar path=${path} size=${this.burnFileSize} segs=${segCount} entry=${this.burnEntryPoint}`);
                }
                else {
                    this.burnFileSize = `${(stat.size / 1024).toFixed(1)} KB`;
                    this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}`;
                    this.burnSegmentInfo = '--';
                    this.burnEntryPoint = '0x0000';
                    traceBurn('UI_BURN_OK', `source=toolbar path=${path} size=${this.burnFileSize} (no parsed info)`);
                }
                this.statusMessage = `HEX 烧录成功: ${path}`;
                this.rightCollapsed = false;
                this.uiState.rightCollapsed = false;
                this.setActiveRightTab(3);
            }
            else {
                this.statusMessage = `HEX 加载失败: ${result.error ?? '未知错误'}`;
                this.burnFirmwareInfo = '';
                traceBurn('UI_BURN_FAIL', `source=toolbar path=${path} err=${result.error ?? 'unknown'}`);
            }
        }
        catch (e) {
            this.statusMessage = `烧录失败: ${e}`;
            this.burnFirmwareInfo = '';
            traceBurn('UI_BURN_FAIL', `source=toolbar path=${path} ex=${e}`);
        }
    }
    async doBrowseHexFile(): Promise<void> {
        try {
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = 1;
            options.fileSuffixFilters = ['.hex', '.HEX', '.bin', '.BIN'];
            const docPicker = new picker.DocumentViewPicker();
            const uris = await docPicker.select(options);
            if (uris && uris.length > 0) {
                this.burnFilePath = uris[0];
            }
        }
        catch (_e) {
            this.statusMessage = '文件选择器不可用，请手动输入路径';
        }
    }
    handleDeleteSelected(): void {
        const selectedDevices = this.appService.schematicEditor.getSelectedDevices();
        const selectedNets = this.appService.schematicEditor.getSelectedNets();
        if (selectedDevices.length > 0) {
            const ids: string[] = [];
            for (let i = 0; i < selectedDevices.length; i++) {
                ids.push(selectedDevices[i].instUuid);
            }
            this.appService.schematicEditor.batchDeleteDevice(ids);
        }
        if (selectedNets.length > 0) {
            this.appService.schematicEditor.clearSelectedRoute();
        }
        if (selectedDevices.length === 0 && selectedNets.length === 0) {
            this.statusMessage = '未选中任何对象';
            return;
        }
        this.selectedComponentId = '';
        this.selectedCount = 0;
        this.selectedWireActive = false;
        this.bumpCanvas();
        this.statusMessage = '已删除';
    }
    handleCopy(): void {
        const selected = this.appService.schematicEditor.getSelectedDevices();
        if (selected.length === 0) {
            this.statusMessage = '请先选中器件';
            return;
        }
        this.clipboardDeviceIds = [];
        for (let i = 0; i < selected.length; i++) {
            this.clipboardDeviceIds.push(selected[i].instUuid);
        }
        this.clipboardLibId = selected[0].libDevId;
        this.statusMessage = selected.length > 1
            ? `已复制 ${selected.length} 个器件`
            : `已复制 ${selected[0].refName}`;
    }
    handlePaste(): void {
        if (this.clipboardDeviceIds.length > 0) {
            const newIds: string[] = [];
            for (let i = 0; i < this.clipboardDeviceIds.length; i++) {
                const offset = 30 + i * 12;
                const r = this.appService.schematicEditor.duplicateDevice(this.clipboardDeviceIds[i], offset, offset);
                if (r.success && r.data) {
                    newIds.push(r.data);
                }
            }
            if (newIds.length > 0) {
                this.appService.schematicEditor.setSelection(newIds);
                this.selectedComponentId = newIds[newIds.length - 1];
                this.bumpCanvas();
                this.statusMessage = newIds.length > 1 ? `已粘贴 ${newIds.length} 个器件` : '已粘贴';
            }
            return;
        }
        if (this.clipboardLibId.length === 0) {
            this.statusMessage = 'Clipboard empty';
            return;
        }
        const x = 200 + (this.navRefreshKey % 5) * 30;
        const y = 150 + (this.navRefreshKey % 5) * 30;
        const r = this.appService.schematicEditor.placeComponent(this.clipboardLibId, { x, y });
        if (r.success && r.data) {
            this.selectedComponentId = r.data.id;
            this.bumpCanvas();
            this.statusMessage = `Placed ${this.clipboardLibId}`;
        }
    }
    handleAlign(type: AlignType): void {
        const sel = this.appService.schematicEditor.getSelectedDevices();
        if (sel.length < 2) {
            this.statusMessage = 'Select at least 2 components';
            return;
        }
        const ids = sel.map(d => d.instUuid);
        this.appService.schematicEditor.batchAlign(ids, type);
        this.bumpCanvas();
        this.statusMessage = 'Aligned';
    }
    handleMirror(): void {
        if (!this.selectedComponentId) {
            this.statusMessage = 'No component selected';
            return;
        }
        this.appService.schematicEditor.mirrorDevice(this.selectedComponentId, true);
        this.bumpCanvas();
        this.statusMessage = 'Mirrored';
    }
    handleRotate(): void {
        if (!this.selectedComponentId) {
            return;
        }
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === this.selectedComponentId);
        if (comp) {
            const next = ((comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
            this.appService.schematicEditor.rotateComponent(comp.id, next);
            this.bumpCanvas();
        }
    }
    placeComponent(libraryId: string): void {
        const resolved = this.appService.componentLibrary.resolveLibraryId(libraryId);
        const x = 150 + (this.navRefreshKey % 8) * 40;
        const y = 100 + (this.navRefreshKey % 6) * 40;
        const r = this.appService.schematicEditor.placeComponent(resolved, { x, y });
        if (r.success && r.data) {
            this.selectedComponentId = r.data.id;
            this.bumpCanvas();
            this.statusMessage = `Placed ${resolved}`;
        }
        else {
            this.statusMessage = `Failed: ${r.error ?? resolved}`;
        }
    }
    getEditorImpl(): SchematicEditorImpl {
        return this.appService.schematicEditor as SchematicEditorImpl;
    }
    toggleGrid(): void {
        this.gridVisible = !this.gridVisible;
        this.getEditorImpl().setGridVisible(this.gridVisible);
        this.uiState.gridVisible = this.gridVisible;
        this.bumpCanvas();
    }
    toggleRuler(): void {
        this.rulerVisible = !this.rulerVisible;
        this.uiState.rulerVisible = this.rulerVisible;
        this.bumpCanvas();
    }
    onLeftPanelResize(delta: number): void {
        this.leftPanelWidth = Math.min(400, Math.max(160, this.leftPanelWidth + delta));
        this.uiState.leftPanelWidth = this.leftPanelWidth;
    }
    onRightPanelResize(delta: number): void {
        this.rightPanelWidth = Math.min(420, Math.max(200, this.rightPanelWidth + delta));
        this.uiState.rightPanelWidth = this.rightPanelWidth;
    }
    setActiveRightTab(tab: number): void {
        this.activeRightTab = tab;
        this.uiState.activeRightTab = tab;
    }
    private onSchematicChanged;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.MENU_BG);
            Column.onKeyEvent((event: KeyEvent) => this.handleKeyEvent(event));
        }, Column);
        this.MenuBar.bind(this)();
        this.MainToolbar.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.layoutWeight(1);
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (!this.leftLibCollapsed || !this.leftNavCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.LeftPanel.bind(this)();
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
            if (!this.leftLibCollapsed || !this.leftNavCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusResizer(this, { side: 'left', onDrag: (d: number) => this.onLeftPanelResize(d) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 859, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        side: 'left',
                                        onDrag: (d: number) => this.onLeftPanelResize(d)
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    side: 'left'
                                });
                            }
                        }, { name: "ProteusResizer" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.CanvasArea.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (!this.rightCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusResizer(this, { side: 'right', onDrag: (d: number) => this.onRightPanelResize(d) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 863, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        side: 'right',
                                        onDrag: (d: number) => this.onRightPanelResize(d)
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    side: 'right'
                                });
                            }
                        }, { name: "ProteusResizer" });
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
            if (!this.rightCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.RightPanel.bind(this)();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Row.pop();
        this.StatusBar.bind(this)();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // Overlay dialogs
            if (this.showWelcomeDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.WelcomeDialog.bind(this)();
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
            if (this.showNewProjectDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.NewProjectDialog.bind(this)();
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
            if (this.showRecoveryDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.RecoveryDialog.bind(this)();
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
            if (this.showOpenDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.FileOpenDialog.bind(this)();
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
            if (this.showSaveAsDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.FileSaveAsDialog.bind(this)();
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
            if (this.showBurnDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.BurnHexDialog.bind(this)();
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
            if (this.showExitConfirmDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.ExitConfirmDialog.bind(this)();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Stack.pop();
    }
    handleKeyEvent(event: KeyEvent): boolean {
        // Track Ctrl modifier state (KeyEvent.ctrlKey removed in API 12)
        if (event.type === KeyType.Down) {
            if (event.keyCode === 2021 || event.keyCode === 2022) {
                this.modifierKeys |= 1;
                return false;
            }
        }
        if (event.type === KeyType.Up) {
            if (event.keyCode === 2021 || event.keyCode === 2022) {
                this.modifierKeys &= ~1;
                return false;
            }
        }
        if (event.type !== KeyType.Down)
            return false;
        const ctrl = (this.modifierKeys & 1) !== 0;
        const kt = (event.keyText ?? '').toLowerCase();
        if (ctrl) {
            switch (kt) {
                case 'z':
                    this.appService.schematicEditor.undo();
                    this.bumpCanvas();
                    return true;
                case 'y':
                    this.appService.schematicEditor.redo();
                    this.bumpCanvas();
                    return true;
                case 's':
                    void this.handleSaveProject();
                    return true;
                case 'c':
                    this.handleCopy();
                    return true;
                case 'v':
                    this.handlePaste();
                    return true;
                case '0':
                    this.appService.schematicEditor.fitAllInView();
                    this.bumpCanvas();
                    return true;
                default: return false;
            }
        }
        if (kt === 'escape' || event.keyCode === 27) {
            this.setToolMode(EditorToolMode.SELECT);
            return true;
        }
        if (kt === 'delete' || event.keyCode === 46 || event.keyCode === 8) {
            this.handleDeleteSelected();
            return true;
        }
        if (kt === 'f1') {
            this.setActiveRightTab(7);
            this.rightCollapsed = false;
            this.uiState.rightCollapsed = false;
            return true;
        }
        if (kt === 'f5') {
            if (this.simRunning) {
                this.appService.stopSimulation();
                this.simRunning = false;
            }
            else {
                this.applySimStartResult(this.appService.startSimulation());
            }
            return true;
        }
        if (kt === 'f7') {
            const errors = this.appService.runErc(false);
            this.ercErrors = errors;
            this.ercCount = errors.length;
            this.navTab = 3;
            this.statusMessage = `ERC: ${errors.length} issues`;
            return true;
        }
        switch (kt) {
            case 'r':
                this.handleRotate();
                return true;
            case 'm':
                this.handleMirror();
                return true;
            case 'p':
                this.setToolMode(EditorToolMode.PLACE);
                return true;
            case 'w':
                this.setToolMode(EditorToolMode.WIRE);
                return true;
            case 'b':
                this.setToolMode(EditorToolMode.BUS);
                return true;
            case 'l':
                this.setToolMode(EditorToolMode.LABEL);
                return true;
            case 'g':
                this.toggleGrid();
                return true;
            case '+':
            case '=':
                this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                this.bumpCanvas();
                return true;
            case '-':
                this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                this.bumpCanvas();
                return true;
            default: return false;
        }
    }
    MenuBar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.MENU_HEIGHT);
            Row.backgroundColor(ProteusColors.MENU_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886094, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.fileMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 978, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886094, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.fileMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886094, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886093, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.editMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 982, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886093, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.editMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886093, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886100, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.viewMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 986, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886100, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.viewMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886100, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886097, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.placeMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 990, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886097, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.placeMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886097, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886099, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.simMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 994, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886099, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.simMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886099, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886096, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.libraryMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 998, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886096, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.libraryMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886096, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886098, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.projectMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1002, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886098, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.projectMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886098, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886095, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.helpMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1006, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886095, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.helpMenuEntries()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886095, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.projectName);
            Text.fontSize(ProteusFonts.MENU);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        Row.pop();
    }
    fileMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886154, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+N', icon: ProteusIconName.NEW, action: () => { void this.handleNewProject(); } },
            { label: { "id": 83886155, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+O', icon: ProteusIconName.OPEN, action: () => { void this.handleOpenProject(); } },
            { label: { "id": 83886161, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } },
            { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => { void this.handleSaveAs(); } },
            { label: '', separator: true, action: () => { } },
            { label: 'Export...', action: () => { this.statusMessage = 'Export: not yet implemented'; } }
        ];
    }
    editMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886165, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+Z', icon: ProteusIconName.UNDO, action: () => {
                    const r = this.appService.schematicEditor.undo();
                    this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
                    this.bumpCanvas();
                } },
            { label: { "id": 83886159, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+Y', icon: ProteusIconName.REDO, action: () => {
                    const r = this.appService.schematicEditor.redo();
                    this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
                    this.bumpCanvas();
                } },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886145, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+C', icon: ProteusIconName.COPY, action: () => this.handleCopy() },
            { label: { "id": 83886156, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+V', icon: ProteusIconName.PASTE, action: () => this.handlePaste() },
            { label: 'Delete', shortcut: 'Del', icon: ProteusIconName.TRASH, action: () => this.handleDeleteSelected() }
        ];
    }
    viewMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886167, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: '+', icon: ProteusIconName.ZOOM_IN, action: () => {
                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                    this.bumpCanvas();
                } },
            { label: { "id": 83886168, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: '-', icon: ProteusIconName.ZOOM_OUT, action: () => {
                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                    this.bumpCanvas();
                } },
            { label: { "id": 83886149, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+0', icon: ProteusIconName.FIT, action: () => {
                    this.appService.schematicEditor.fitAllInView();
                    this.bumpCanvas();
                } },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886150, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'G', icon: ProteusIconName.GRID, action: () => this.toggleGrid() },
            { label: 'Toggle Ruler', shortcut: 'R', icon: ProteusIconName.RULER, action: () => this.toggleRuler() }
        ];
    }
    placeMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886157, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'P', icon: ProteusIconName.COMPONENT, action: () => this.setToolMode(EditorToolMode.PLACE) },
            { label: { "id": 83886166, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'W', icon: ProteusIconName.WIRE, action: () => this.setToolMode(EditorToolMode.WIRE) },
            { label: { "id": 83886144, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'B', icon: ProteusIconName.BUS, action: () => this.setToolMode(EditorToolMode.BUS) },
            { label: { "id": 83886152, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'L', icon: ProteusIconName.LABEL, action: () => this.setToolMode(EditorToolMode.LABEL) },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886158, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Shift+P', icon: ProteusIconName.POWER, action: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') },
            { label: { "id": 83886151, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Shift+G', icon: ProteusIconName.GROUND, action: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }
        ];
    }
    simMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886163, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'F5', icon: ProteusIconName.PLAY, action: async () => {
                    if (this.simRunning) {
                        this.appService.stopSimulation();
                        this.simRunning = false;
                    }
                    else {
                        this.applySimStartResult(this.appService.startSimulation());
                    }
                } },
            { label: { "id": 83886162, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'F6', icon: ProteusIconName.PAUSE, action: () => {
                    this.toggleSimPause();
                } },
            { label: { "id": 83886164, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Shift+F5', icon: ProteusIconName.STOP, action: () => {
                    this.appService.stopSimulation();
                    this.simRunning = false;
                    this.simPaused = false;
                } },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886148, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'F7', icon: ProteusIconName.ERC, action: () => {
                    const errors = this.appService.runErc(false);
                    this.ercErrors = errors;
                    const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                    this.ercCount = errors.length;
                    this.navTab = 3;
                    this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                } }
        ];
    }
    libraryMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: 'Browse...', action: () => { this.leftLibCollapsed = false; this.uiState.leftLibCollapsed = false; } },
            { label: 'Search...', shortcut: 'Ctrl+L', icon: ProteusIconName.SEARCH, action: () => {
                    this.leftLibCollapsed = false;
                    this.uiState.leftLibCollapsed = false;
                    this.statusMessage = 'Type in search box';
                } },
            { label: '', separator: true, action: () => { } },
            { label: 'Refresh', action: () => { this.refreshComponentList(); this.bumpCanvas(); } }
        ];
    }
    projectMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886154, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+N', icon: ProteusIconName.NEW, action: () => { void this.handleNewProject(); } },
            { label: { "id": 83886155, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+O', icon: ProteusIconName.OPEN, action: () => { void this.handleOpenProject(); } },
            { label: { "id": 83886161, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } }
        ];
    }
    helpMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: 'Keyboard Shortcuts', shortcut: 'F1', action: () => {
                    this.setActiveRightTab(7);
                    if (this.rightCollapsed) {
                        this.rightCollapsed = false;
                        this.uiState.rightCollapsed = false;
                    }
                    this.statusMessage = 'Opened Settings panel — see shortcuts in toolbar tooltips';
                } },
            { label: '', separator: true, action: () => { } },
            { label: 'About', action: () => { this.statusMessage = 'ElecDraw Schematic Editor v2.0'; } }
        ];
    }
    MainToolbar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.padding({ left: 4, right: 4 });
            Row.alignItems(VerticalAlign.Center);
            Row.width('100%');
            Row.height(ProteusDimens.TOOLBAR_HEIGHT);
            Row.backgroundColor(ProteusColors.TOOLBAR_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'File',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1157, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.NEW,
                                                tooltip: '新建文件 (Ctrl+N)',
                                                showLabel: false,
                                                onAction: () => { void this.handleNewProject(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1158, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.OPEN,
                                                tooltip: '打开文件 (Ctrl+O)',
                                                showLabel: false,
                                                onAction: () => { void this.handleOpenProject(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1159, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.SAVE,
                                                tooltip: '保存文件 (Ctrl+S)',
                                                showLabel: false,
                                                onAction: () => { void this.handleSaveProject(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1156, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'File',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1157, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.NEW,
                                                    tooltip: '新建文件 (Ctrl+N)',
                                                    showLabel: false,
                                                    onAction: () => { void this.handleNewProject(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1158, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.OPEN,
                                                    tooltip: '打开文件 (Ctrl+O)',
                                                    showLabel: false,
                                                    onAction: () => { void this.handleOpenProject(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1159, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.SAVE,
                                                    tooltip: '保存文件 (Ctrl+S)',
                                                    showLabel: false,
                                                    onAction: () => { void this.handleSaveProject(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false, onAction: () => {
                                                const r = this.appService.schematicEditor.undo();
                                                this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
                                                this.bumpCanvas();
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1163, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.UNDO,
                                                tooltip: '撤销 (Ctrl+Z)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const r = this.appService.schematicEditor.undo();
                                                    this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
                                                    this.bumpCanvas();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false, onAction: () => {
                                                const r = this.appService.schematicEditor.redo();
                                                this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
                                                this.bumpCanvas();
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1168, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.REDO,
                                                tooltip: '重做 (Ctrl+Y)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const r = this.appService.schematicEditor.redo();
                                                    this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
                                                    this.bumpCanvas();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                            disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                            onAction: () => this.handleDeleteSelected() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1173, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.TRASH,
                                                tooltip: '删除 (Del)',
                                                showLabel: false,
                                                disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                                onAction: () => this.handleDeleteSelected()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                            disabled: this.selectedCount === 0 && !this.selectedWireActive
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1162, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'History',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false, onAction: () => {
                                                    const r = this.appService.schematicEditor.undo();
                                                    this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
                                                    this.bumpCanvas();
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1163, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.UNDO,
                                                    tooltip: '撤销 (Ctrl+Z)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const r = this.appService.schematicEditor.undo();
                                                        this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
                                                        this.bumpCanvas();
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false, onAction: () => {
                                                    const r = this.appService.schematicEditor.redo();
                                                    this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
                                                    this.bumpCanvas();
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1168, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.REDO,
                                                    tooltip: '重做 (Ctrl+Y)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const r = this.appService.schematicEditor.redo();
                                                        this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
                                                        this.bumpCanvas();
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                                disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                                onAction: () => this.handleDeleteSelected() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1173, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.TRASH,
                                                    tooltip: '删除 (Del)',
                                                    showLabel: false,
                                                    disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                                    onAction: () => this.handleDeleteSelected()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                                disabled: this.selectedCount === 0 && !this.selectedWireActive
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                            disabled: this.selectedCount === 0, onAction: () => this.handleCopy() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1179, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.COPY,
                                                tooltip: '复制 (Ctrl+C)',
                                                showLabel: false,
                                                disabled: this.selectedCount === 0,
                                                onAction: () => this.handleCopy()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                            disabled: this.selectedCount === 0
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1181, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.PASTE,
                                                tooltip: '粘贴 (Ctrl+V)',
                                                showLabel: false,
                                                onAction: () => this.handlePaste()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1178, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Edit',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                                disabled: this.selectedCount === 0, onAction: () => this.handleCopy() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1179, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.COPY,
                                                    tooltip: '复制 (Ctrl+C)',
                                                    showLabel: false,
                                                    disabled: this.selectedCount === 0,
                                                    onAction: () => this.handleCopy()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                                disabled: this.selectedCount === 0
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1181, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.PASTE,
                                                    tooltip: '粘贴 (Ctrl+V)',
                                                    showLabel: false,
                                                    onAction: () => this.handlePaste()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false, onAction: () => {
                                                this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                                                this.bumpCanvas();
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1185, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ZOOM_IN,
                                                tooltip: '放大 (+)',
                                                showLabel: false,
                                                onAction: () => {
                                                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                                                    this.bumpCanvas();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false, onAction: () => {
                                                this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                                                this.bumpCanvas();
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1189, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ZOOM_OUT,
                                                tooltip: '缩小 (-)',
                                                showLabel: false,
                                                onAction: () => {
                                                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                                                    this.bumpCanvas();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false, onAction: () => {
                                                this.appService.schematicEditor.fitAllInView();
                                                this.bumpCanvas();
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1193, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.FIT,
                                                tooltip: '适应窗口 (Ctrl+0)',
                                                showLabel: false,
                                                onAction: () => {
                                                    this.appService.schematicEditor.fitAllInView();
                                                    this.bumpCanvas();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
                                            active: this.gridVisible, onAction: () => this.toggleGrid() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1197, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.GRID,
                                                tooltip: '显示/隐藏网格 (G)',
                                                showLabel: false,
                                                active: this.gridVisible,
                                                onAction: () => this.toggleGrid()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
                                            active: this.gridVisible
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1184, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'View',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false, onAction: () => {
                                                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                                                    this.bumpCanvas();
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1185, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ZOOM_IN,
                                                    tooltip: '放大 (+)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                                                        this.bumpCanvas();
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false, onAction: () => {
                                                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                                                    this.bumpCanvas();
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1189, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ZOOM_OUT,
                                                    tooltip: '缩小 (-)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                                                        this.bumpCanvas();
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false, onAction: () => {
                                                    this.appService.schematicEditor.fitAllInView();
                                                    this.bumpCanvas();
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1193, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.FIT,
                                                    tooltip: '适应窗口 (Ctrl+0)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        this.appService.schematicEditor.fitAllInView();
                                                        this.bumpCanvas();
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
                                                active: this.gridVisible, onAction: () => this.toggleGrid() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1197, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.GRID,
                                                    tooltip: '显示/隐藏网格 (G)',
                                                    showLabel: false,
                                                    active: this.gridVisible,
                                                    onAction: () => this.toggleGrid()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1202, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.COMPONENT,
                                                tooltip: '放置器件 (P)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.PLACE,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId)
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.PLACE
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.WIRE,
                                            disabled: this.simRunning,
                                            onAction: () => this.setToolMode(EditorToolMode.WIRE) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1204, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.WIRE,
                                                tooltip: '连线 (W)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.WIRE)
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.WIRE,
                                            disabled: this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.BUS,
                                            disabled: this.simRunning,
                                            onAction: () => this.setToolMode(EditorToolMode.BUS) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1208, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.BUS,
                                                tooltip: '总线 (B)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.BUS,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.BUS)
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.BUS,
                                            disabled: this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1212, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.LABEL,
                                                tooltip: '网络标签 (L)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.LABEL,
                                                onAction: () => this.setToolMode(EditorToolMode.LABEL)
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.LABEL
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false,
                                            onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1214, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.POWER,
                                                tooltip: '放置 VCC (Shift+P)',
                                                showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC')
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false,
                                            onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1216, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.GROUND,
                                                tooltip: '放置 GND (Shift+G)',
                                                showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND')
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1201, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Place',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1202, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.COMPONENT,
                                                    tooltip: '放置器件 (P)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.PLACE,
                                                    onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId)
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.PLACE
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.WIRE) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1204, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.WIRE,
                                                    tooltip: '连线 (W)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.WIRE,
                                                    disabled: this.simRunning,
                                                    onAction: () => this.setToolMode(EditorToolMode.WIRE)
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.BUS,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.BUS) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1208, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.BUS,
                                                    tooltip: '总线 (B)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.BUS,
                                                    disabled: this.simRunning,
                                                    onAction: () => this.setToolMode(EditorToolMode.BUS)
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.BUS,
                                                disabled: this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1212, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.LABEL,
                                                    tooltip: '网络标签 (L)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.LABEL,
                                                    onAction: () => this.setToolMode(EditorToolMode.LABEL)
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.LABEL
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1214, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.POWER,
                                                    tooltip: '放置 VCC (Shift+P)',
                                                    showLabel: false,
                                                    onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC')
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1216, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.GROUND,
                                                    tooltip: '放置 GND (Shift+G)',
                                                    showLabel: false,
                                                    onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND')
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false
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
                        title: 'Align',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1221, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ALIGN_LEFT,
                                                tooltip: '左对齐',
                                                showLabel: false,
                                                disabled: this.selectedCount < 2,
                                                onAction: () => this.handleAlign('left')
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                            disabled: this.selectedCount < 2
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1223, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ALIGN_RIGHT,
                                                tooltip: '右对齐',
                                                showLabel: false,
                                                disabled: this.selectedCount < 2,
                                                onAction: () => this.handleAlign('right')
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                            disabled: this.selectedCount < 2
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1225, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ALIGN_TOP,
                                                tooltip: '顶对齐',
                                                showLabel: false,
                                                disabled: this.selectedCount < 2,
                                                onAction: () => this.handleAlign('top')
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                            disabled: this.selectedCount < 2
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                            disabled: this.selectedCount < 3, onAction: () => {
                                                const sel = this.appService.schematicEditor.getSelectedDevices();
                                                if (sel.length >= 3) {
                                                    const ids = sel.map(d => d.instUuid);
                                                    this.appService.schematicEditor.batchDistribute(ids, 'horiz');
                                                    this.bumpCanvas();
                                                    this.statusMessage = 'Distributed horizontally';
                                                }
                                                else {
                                                    this.statusMessage = 'Select at least 3 components';
                                                }
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1227, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.DISTRIBUTE,
                                                tooltip: '水平均布',
                                                showLabel: false,
                                                disabled: this.selectedCount < 3,
                                                onAction: () => {
                                                    const sel = this.appService.schematicEditor.getSelectedDevices();
                                                    if (sel.length >= 3) {
                                                        const ids = sel.map(d => d.instUuid);
                                                        this.appService.schematicEditor.batchDistribute(ids, 'horiz');
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'Distributed horizontally';
                                                    }
                                                    else {
                                                        this.statusMessage = 'Select at least 3 components';
                                                    }
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                            disabled: this.selectedCount < 3
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1239, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ROTATE,
                                                tooltip: '旋转 (R)',
                                                showLabel: false,
                                                disabled: this.selectedComponentId.length === 0,
                                                onAction: () => this.handleRotate()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1241, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.MIRROR,
                                                tooltip: '镜像 (M)',
                                                showLabel: false,
                                                disabled: this.selectedComponentId.length === 0,
                                                onAction: () => this.handleMirror()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1220, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Align',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1221, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ALIGN_LEFT,
                                                    tooltip: '左对齐',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 2,
                                                    onAction: () => this.handleAlign('left')
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                                disabled: this.selectedCount < 2
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1223, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ALIGN_RIGHT,
                                                    tooltip: '右对齐',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 2,
                                                    onAction: () => this.handleAlign('right')
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                                disabled: this.selectedCount < 2
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1225, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ALIGN_TOP,
                                                    tooltip: '顶对齐',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 2,
                                                    onAction: () => this.handleAlign('top')
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                                disabled: this.selectedCount < 2
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                                disabled: this.selectedCount < 3, onAction: () => {
                                                    const sel = this.appService.schematicEditor.getSelectedDevices();
                                                    if (sel.length >= 3) {
                                                        const ids = sel.map(d => d.instUuid);
                                                        this.appService.schematicEditor.batchDistribute(ids, 'horiz');
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'Distributed horizontally';
                                                    }
                                                    else {
                                                        this.statusMessage = 'Select at least 3 components';
                                                    }
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1227, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.DISTRIBUTE,
                                                    tooltip: '水平均布',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 3,
                                                    onAction: () => {
                                                        const sel = this.appService.schematicEditor.getSelectedDevices();
                                                        if (sel.length >= 3) {
                                                            const ids = sel.map(d => d.instUuid);
                                                            this.appService.schematicEditor.batchDistribute(ids, 'horiz');
                                                            this.bumpCanvas();
                                                            this.statusMessage = 'Distributed horizontally';
                                                        }
                                                        else {
                                                            this.statusMessage = 'Select at least 3 components';
                                                        }
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                                disabled: this.selectedCount < 3
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1239, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ROTATE,
                                                    tooltip: '旋转 (R)',
                                                    showLabel: false,
                                                    disabled: this.selectedComponentId.length === 0,
                                                    onAction: () => this.handleRotate()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1241, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.MIRROR,
                                                    tooltip: '镜像 (M)',
                                                    showLabel: false,
                                                    disabled: this.selectedComponentId.length === 0,
                                                    onAction: () => this.handleMirror()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0
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
                        title: 'Align'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'Sim',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                            tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)', showLabel: false,
                                            active: this.simRunning,
                                            onAction: async () => {
                                                if (this.simRunning) {
                                                    this.appService.stopSimulation();
                                                    this.simRunning = false;
                                                    this.simPaused = false;
                                                }
                                                else {
                                                    this.applySimStartResult(this.appService.startSimulation());
                                                    this.simPaused = false;
                                                }
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1246, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                                tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)',
                                                showLabel: false,
                                                active: this.simRunning,
                                                onAction: async () => {
                                                    if (this.simRunning) {
                                                        this.appService.stopSimulation();
                                                        this.simRunning = false;
                                                        this.simPaused = false;
                                                    }
                                                    else {
                                                        this.applySimStartResult(this.appService.startSimulation());
                                                        this.simPaused = false;
                                                    }
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                            tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)', showLabel: false,
                                            active: this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                            disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1260, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.PAUSE,
                                                tooltip: '暂停仿真 (F6)',
                                                showLabel: false,
                                                disabled: !this.simRunning,
                                                onAction: () => { this.toggleSimPause(); }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                            disabled: !this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false, onAction: () => {
                                                const errors = this.appService.runErc(false);
                                                this.ercErrors = errors;
                                                const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                                                this.ercCount = errors.length;
                                                this.navTab = 3;
                                                this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1262, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ERC,
                                                tooltip: '电气规则检查 (F7)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const errors = this.appService.runErc(false);
                                                    this.ercErrors = errors;
                                                    const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                                                    this.ercCount = errors.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1245, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Sim',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                                tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)', showLabel: false,
                                                active: this.simRunning,
                                                onAction: async () => {
                                                    if (this.simRunning) {
                                                        this.appService.stopSimulation();
                                                        this.simRunning = false;
                                                        this.simPaused = false;
                                                    }
                                                    else {
                                                        this.applySimStartResult(this.appService.startSimulation());
                                                        this.simPaused = false;
                                                    }
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1246, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                                    tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)',
                                                    showLabel: false,
                                                    active: this.simRunning,
                                                    onAction: async () => {
                                                        if (this.simRunning) {
                                                            this.appService.stopSimulation();
                                                            this.simRunning = false;
                                                            this.simPaused = false;
                                                        }
                                                        else {
                                                            this.applySimStartResult(this.appService.startSimulation());
                                                            this.simPaused = false;
                                                        }
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                                tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)', showLabel: false,
                                                active: this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                                disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1260, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.PAUSE,
                                                    tooltip: '暂停仿真 (F6)',
                                                    showLabel: false,
                                                    disabled: !this.simRunning,
                                                    onAction: () => { this.toggleSimPause(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                                disabled: !this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false, onAction: () => {
                                                    const errors = this.appService.runErc(false);
                                                    this.ercErrors = errors;
                                                    const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                                                    this.ercCount = errors.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1262, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ERC,
                                                    tooltip: '电气规则检查 (F7)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const errors = this.appService.runErc(false);
                                                        this.ercErrors = errors;
                                                        const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                                                        this.ercCount = errors.length;
                                                        this.navTab = 3;
                                                        this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false
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
                        title: 'Sim'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolGroup(this, {
                        title: 'AI',
                        content: () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false,
                                            onAction: async () => {
                                                this.statusMessage = 'AI auto-routing...';
                                                const ok = await this.appService.aiAutoRoute();
                                                if (ok) {
                                                    this.bumpCanvas();
                                                    this.statusMessage = 'AI routing complete';
                                                }
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1273, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                tooltip: 'AI 自动布线 (F8)',
                                                showLabel: false,
                                                onAction: async () => {
                                                    this.statusMessage = 'AI auto-routing...';
                                                    const ok = await this.appService.aiAutoRoute();
                                                    if (ok) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI routing complete';
                                                    }
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false,
                                            onAction: async () => {
                                                this.statusMessage = 'AI layout optimizing...';
                                                const ok = await this.appService.aiOptimizePlacement();
                                                if (ok) {
                                                    this.bumpCanvas();
                                                    this.statusMessage = 'AI layout optimized';
                                                }
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1282, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.AI_LAYOUT,
                                                tooltip: 'AI 优化布局 (F9)',
                                                showLabel: false,
                                                onAction: async () => {
                                                    this.statusMessage = 'AI layout optimizing...';
                                                    const ok = await this.appService.aiOptimizePlacement();
                                                    if (ok) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI layout optimized';
                                                    }
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false,
                                            onAction: () => {
                                                const errors = this.appService.runErc(true);
                                                this.ercErrors = errors;
                                                this.ercCount = errors.length;
                                                this.navTab = 3;
                                                this.statusMessage = `AI diagnosis: ${errors.length} issues`;
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1291, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.AI_DIAG,
                                                tooltip: 'AI 电路诊断 (F10)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const errors = this.appService.runErc(true);
                                                    this.ercErrors = errors;
                                                    this.ercCount = errors.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `AI diagnosis: ${errors.length} issues`;
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1272, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'AI',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false,
                                                onAction: async () => {
                                                    this.statusMessage = 'AI auto-routing...';
                                                    const ok = await this.appService.aiAutoRoute();
                                                    if (ok) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI routing complete';
                                                    }
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1273, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_ROUTE,
                                                    tooltip: 'AI 自动布线 (F8)',
                                                    showLabel: false,
                                                    onAction: async () => {
                                                        this.statusMessage = 'AI auto-routing...';
                                                        const ok = await this.appService.aiAutoRoute();
                                                        if (ok) {
                                                            this.bumpCanvas();
                                                            this.statusMessage = 'AI routing complete';
                                                        }
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false,
                                                onAction: async () => {
                                                    this.statusMessage = 'AI layout optimizing...';
                                                    const ok = await this.appService.aiOptimizePlacement();
                                                    if (ok) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI layout optimized';
                                                    }
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1282, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_LAYOUT,
                                                    tooltip: 'AI 优化布局 (F9)',
                                                    showLabel: false,
                                                    onAction: async () => {
                                                        this.statusMessage = 'AI layout optimizing...';
                                                        const ok = await this.appService.aiOptimizePlacement();
                                                        if (ok) {
                                                            this.bumpCanvas();
                                                            this.statusMessage = 'AI layout optimized';
                                                        }
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false,
                                                onAction: () => {
                                                    const errors = this.appService.runErc(true);
                                                    this.ercErrors = errors;
                                                    this.ercCount = errors.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `AI diagnosis: ${errors.length} issues`;
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1291, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_DIAG,
                                                    tooltip: 'AI 电路诊断 (F10)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const errors = this.appService.runErc(true);
                                                        this.ercErrors = errors;
                                                        this.ercCount = errors.length;
                                                        this.navTab = 3;
                                                        this.statusMessage = `AI diagnosis: ${errors.length} issues`;
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false
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
                        title: 'AI'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.MORE, tooltip: '更多工具', showLabel: false,
                        onAction: () => { this.statusMessage = 'All tools available in menus'; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1303, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.MORE,
                            tooltip: '更多工具',
                            showLabel: false,
                            onAction: () => { this.statusMessage = 'All tools available in menus'; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.MORE, tooltip: '更多工具', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        Row.pop();
    }
    LeftPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.leftPanelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: { right: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (!this.leftLibCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.layoutWeight(3);
                        Column.width('100%');
                    }, Column);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusPanelTitle(this, {
                                    title: { "id": 83886091, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false,
                                    onToggle: () => { this.leftLibCollapsed = true; this.uiState.leftLibCollapsed = true; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1319, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        title: { "id": 83886091, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        collapsed: false,
                                        onToggle: () => { this.leftLibCollapsed = true; this.uiState.leftLibCollapsed = true; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    title: { "id": 83886091, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false
                                });
                            }
                        }, { name: "ProteusPanelTitle" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        TextInput.create({ placeholder: { "id": 83886130, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, text: this.searchKeyword });
                        TextInput.height(ProteusDimens.SEARCH_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_KEY);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.BORDER });
                        TextInput.margin({ left: 4, right: 4, top: 4, bottom: 2 });
                        TextInput.onChange((v: string) => {
                            this.searchKeyword = v;
                            this.refreshComponentList();
                        });
                    }, TextInput);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.width('100%');
                        Scroll.scrollBar(BarState.Auto);
                    }, Scroll);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.searchKeyword.length > 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    ForEach.create();
                                    const forEachItemGenFunction = _item => {
                                        const item = _item;
                                        {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                if (isInitialRender) {
                                                    let componentCall = new ProteusTreeRow(this, {
                                                        label: item.split('|')[1] ?? item,
                                                        selected: this.selectedTreeItem === item,
                                                        onClickRow: () => this.selectLibraryItem(item),
                                                        onDoubleClick: () => this.placeComponent(item.split('|')[0])
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1341, col: 19 });
                                                    ViewPU.create(componentCall);
                                                    let paramsLambda = () => {
                                                        return {
                                                            label: item.split('|')[1] ?? item,
                                                            selected: this.selectedTreeItem === item,
                                                            onClickRow: () => this.selectLibraryItem(item),
                                                            onDoubleClick: () => this.placeComponent(item.split('|')[0])
                                                        };
                                                    };
                                                    componentCall.paramsGenerator_ = paramsLambda;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                                        label: item.split('|')[1] ?? item,
                                                        selected: this.selectedTreeItem === item
                                                    });
                                                }
                                            }, { name: "ProteusTreeRow" });
                                        }
                                    };
                                    this.forEachUpdateFunction(elmtId, this.componentList, forEachItemGenFunction, (item: string) => item, false, false);
                                }, ForEach);
                                ForEach.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    ForEach.create();
                                    const forEachItemGenFunction = (_item, idx: number) => {
                                        const node = _item;
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Column.create();
                                        }, Column);
                                        {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                if (isInitialRender) {
                                                    let componentCall = new ProteusTreeRow(this, {
                                                        label: node.label,
                                                        expandable: true,
                                                        expanded: this.expandedCategories.has(node.cat),
                                                        onToggleExpand: () => { this.toggleCategory(node.cat); },
                                                        onClickRow: () => { this.toggleCategory(node.cat); }
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1351, col: 21 });
                                                    ViewPU.create(componentCall);
                                                    let paramsLambda = () => {
                                                        return {
                                                            label: node.label,
                                                            expandable: true,
                                                            expanded: this.expandedCategories.has(node.cat),
                                                            onToggleExpand: () => { this.toggleCategory(node.cat); },
                                                            onClickRow: () => { this.toggleCategory(node.cat); }
                                                        };
                                                    };
                                                    componentCall.paramsGenerator_ = paramsLambda;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                                        label: node.label,
                                                        expandable: true,
                                                        expanded: this.expandedCategories.has(node.cat)
                                                    });
                                                }
                                            }, { name: "ProteusTreeRow" });
                                        }
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            If.create();
                                            if (this.expandedCategories.has(node.cat)) {
                                                this.ifElseBranchUpdateFunction(0, () => {
                                                    this.CategoryItems.bind(this)(node.cat);
                                                });
                                            }
                                            else {
                                                this.ifElseBranchUpdateFunction(1, () => {
                                                });
                                            }
                                        }, If);
                                        If.pop();
                                        Column.pop();
                                    };
                                    this.forEachUpdateFunction(elmtId, this.categoryNodes, forEachItemGenFunction, (node: CategoryNode) => node.cat, true, false);
                                }, ForEach);
                                ForEach.pop();
                            });
                        }
                    }, If);
                    If.pop();
                    Column.pop();
                    Scroll.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.onClick(() => {
                            if (this.previewComponentId) {
                                this.placeComponent(this.previewComponentId);
                            }
                            else if (this.selectedTreeItem) {
                                this.placeComponent(this.selectedTreeItem.split('|')[0]);
                            }
                            else {
                                this.statusMessage = 'Select a component first';
                            }
                        });
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ComponentPreview(this, { libraryId: this.previewComponentId }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1371, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        libraryId: this.previewComponentId
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    libraryId: this.previewComponentId
                                });
                            }
                        }, { name: "ComponentPreview" });
                    }
                    __Common__.pop();
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
            if (!this.leftNavCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.layoutWeight(1);
                        Column.width('100%');
                        Column.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
                    }, Column);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusPanelTitle(this, {
                                    title: { "id": 83886092, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false,
                                    onToggle: () => { this.leftNavCollapsed = true; this.uiState.leftNavCollapsed = true; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1388, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        title: { "id": 83886092, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        collapsed: false,
                                        onToggle: () => { this.leftNavCollapsed = true; this.uiState.leftNavCollapsed = true; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    title: { "id": 83886092, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false
                                });
                            }
                        }, { name: "ProteusPanelTitle" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.width('100%');
                        Row.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886106, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 0, onSelect: () => { this.navTab = 0; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1394, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: { "id": 83886106, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 0,
                                        onSelect: () => { this.navTab = 0; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: { "id": 83886106, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 0
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886102, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 1, onSelect: () => { this.navTab = 1; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1395, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: { "id": 83886102, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 1,
                                        onSelect: () => { this.navTab = 1; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: { "id": 83886102, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 1
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886104, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 2, onSelect: () => { this.navTab = 2; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1396, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: { "id": 83886104, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 2,
                                        onSelect: () => { this.navTab = 2; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: { "id": 83886104, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 2
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886103, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 3, onSelect: () => { this.navTab = 3; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1397, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: { "id": 83886103, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 3,
                                        onSelect: () => { this.navTab = 3; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: { "id": 83886103, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 3
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.width('100%');
                        Scroll.backgroundColor(ProteusColors.CANVAS_BG);
                    }, Scroll);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.navTab === 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.NavSheetTree.bind(this)();
                            });
                        }
                        else if (this.navTab === 1) {
                            this.ifElseBranchUpdateFunction(1, () => {
                                this.NavComponentList.bind(this)();
                            });
                        }
                        else if (this.navTab === 2) {
                            this.ifElseBranchUpdateFunction(2, () => {
                                this.NavNetList.bind(this)();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(3, () => {
                                this.NavErrorList.bind(this)();
                            });
                        }
                    }, If);
                    If.pop();
                    Column.pop();
                    Scroll.pop();
                    Column.pop();
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
    CategoryItems(cat: ComponentCategory, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const item = _item;
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusTreeRow(this, {
                                label: item.split('|')[1] ?? item,
                                depth: 1,
                                selected: this.selectedTreeItem === item,
                                onClickRow: () => this.selectLibraryItem(item),
                                onDoubleClick: () => this.placeComponent(item.split('|')[0])
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1435, col: 7 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: item.split('|')[1] ?? item,
                                    depth: 1,
                                    selected: this.selectedTreeItem === item,
                                    onClickRow: () => this.selectLibraryItem(item),
                                    onDoubleClick: () => this.placeComponent(item.split('|')[0])
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: item.split('|')[1] ?? item,
                                depth: 1,
                                selected: this.selectedTreeItem === item
                            });
                        }
                    }, { name: "ProteusTreeRow" });
                }
            };
            this.forEachUpdateFunction(elmtId, this.getCategoryItems(cat), forEachItemGenFunction, (item: string) => item, false, false);
        }, ForEach);
        ForEach.pop();
    }
    getCategoryItems(cat: ComponentCategory): string[] {
        const result = this.appService.componentLibrary.listByCategory(cat, 1, 30);
        return result.items.map(c => `${c.id}|${c.name}`);
    }
    NavSheetTree(parent = null) {
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTreeRow(this, {
                        label: this.projectName,
                        expandable: true,
                        expanded: true,
                        selected: true,
                        onClickRow: () => { },
                        onToggleExpand: () => { }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1452, col: 5 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.projectName,
                            expandable: true,
                            expanded: true,
                            selected: true,
                            onClickRow: () => { },
                            onToggleExpand: () => { }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.projectName,
                        expandable: true,
                        expanded: true,
                        selected: true
                    });
                }
            }, { name: "ProteusTreeRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTreeRow(this, {
                        label: { "id": 83886105, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        depth: 1,
                        selected: false,
                        onClickRow: () => { }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1460, col: 5 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: { "id": 83886105, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            depth: 1,
                            selected: false,
                            onClickRow: () => { }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: { "id": 83886105, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        depth: 1,
                        selected: false
                    });
                }
            }, { name: "ProteusTreeRow" });
        }
    }
    NavComponentList(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const comp = _item;
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusNavCompRow(this, {
                                refDes: `${comp.refDes}`,
                                libraryId: `${comp.libraryId}`,
                                selected: comp.id === this.selectedComponentId,
                                onAction: () => {
                                    this.selectedComponentId = comp.id;
                                    this.appService.schematicEditor.setSelection([comp.id]);
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1471, col: 7 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    refDes: `${comp.refDes}`,
                                    libraryId: `${comp.libraryId}`,
                                    selected: comp.id === this.selectedComponentId,
                                    onAction: () => {
                                        this.selectedComponentId = comp.id;
                                        this.appService.schematicEditor.setSelection([comp.id]);
                                    }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                refDes: `${comp.refDes}`,
                                libraryId: `${comp.libraryId}`,
                                selected: comp.id === this.selectedComponentId
                            });
                        }
                    }, { name: "ProteusNavCompRow" });
                }
            };
            this.forEachUpdateFunction(elmtId, this.getDocComponents(), forEachItemGenFunction, (comp: ComponentInstance) => `${comp.id}_${this.navRefreshKey}`, false, false);
        }, ForEach);
        ForEach.pop();
    }
    getDocComponents(): ComponentInstance[] {
        return this.appService.schematicEditor.getDocument().components;
    }
    NavNetList(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = (_item, idx: number) => {
                const netName = _item;
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusNavNetRow(this, {
                                label: `NET ${idx + 1}`,
                                onAction: () => { }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1490, col: 7 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: `NET ${idx + 1}`,
                                    onAction: () => { }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: `NET ${idx + 1}`
                            });
                        }
                    }, { name: "ProteusNavNetRow" });
                }
            };
            this.forEachUpdateFunction(elmtId, this.getDocNets(), forEachItemGenFunction, (netName: string, idx: number) => `${netName}_${idx}`, true, true);
        }, ForEach);
        ForEach.pop();
    }
    getDocNets(): string[] {
        const doc: SchematicDocument = this.appService.schematicEditor.getDocument();
        const nets: Set<string> = new Set();
        for (let i = 0; i < doc.wires.length; i++) {
            nets.add(doc.wires[i].netId);
        }
        const result: string[] = [];
        nets.forEach((n: string) => result.push(n));
        return result;
    }
    NavErrorList(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.ercErrors.length === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.padding({ left: 8, top: 8 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create({ "id": 83886107, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" });
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.ERC_OK);
                    }, Text);
                    Text.pop();
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = (_item, idx: number) => {
                            const err = _item;
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusErcRow(this, {
                                            mark: err.severity === 'error' || err.severity === 'critical' ? '✕' : '⚠',
                                            markColor: err.severity === 'error' || err.severity === 'critical' ?
                                                ProteusColors.ERC_ERR : ProteusColors.ERC_WARN,
                                            desc: err.desc,
                                            onAction: () => { }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1519, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                mark: err.severity === 'error' || err.severity === 'critical' ? '✕' : '⚠',
                                                markColor: err.severity === 'error' || err.severity === 'critical' ?
                                                    ProteusColors.ERC_ERR : ProteusColors.ERC_WARN,
                                                desc: err.desc,
                                                onAction: () => { }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            mark: err.severity === 'error' || err.severity === 'critical' ? '✕' : '⚠',
                                            markColor: err.severity === 'error' || err.severity === 'critical' ?
                                                ProteusColors.ERC_ERR : ProteusColors.ERC_WARN,
                                            desc: err.desc
                                        });
                                    }
                                }, { name: "ProteusErcRow" });
                            }
                        };
                        this.forEachUpdateFunction(elmtId, this.ercErrors, forEachItemGenFunction, (err: ErcError, idx: number) => `${idx}_${err.desc}`, true, true);
                    }, ForEach);
                    ForEach.pop();
                });
            }
        }, If);
        If.pop();
    }
    CanvasArea(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create({ alignContent: Alignment.BottomEnd });
            Stack.layoutWeight(1);
            Stack.height('100%');
            Stack.border({ width: 1, color: ProteusColors.DIVIDER });
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.width('100%');
            __Common__.height('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new SchematicCanvas(this, {
                        canvasVersion: this.__canvasVersion,
                        selectedComponentId: this.__selectedComponentId,
                        mouseX: this.__mouseX,
                        mouseY: this.__mouseY,
                        zoomPercent: this.__zoomPercent,
                        toolMode: this.__toolMode,
                        pendingLibraryId: this.__previewComponentId,
                        wireStartActive: this.__wireStartActive,
                        wireStartX: this.__wireStartX,
                        wireStartY: this.__wireStartY,
                        rulerVisible: this.rulerVisible,
                        ercErrors: this.ercErrors,
                        onStatusChange: (msg: string) => { this.statusMessage = msg; },
                        onDocumentChanged: () => { this.bumpCanvas(); },
                        onCopySelected: () => { this.handleCopy(); },
                        onDeleteSelected: () => { this.handleDeleteSelected(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1533, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            canvasVersion: this.canvasVersion,
                            selectedComponentId: this.selectedComponentId,
                            mouseX: this.mouseX,
                            mouseY: this.mouseY,
                            zoomPercent: this.zoomPercent,
                            toolMode: this.toolMode,
                            pendingLibraryId: this.previewComponentId,
                            wireStartActive: this.wireStartActive,
                            wireStartX: this.wireStartX,
                            wireStartY: this.wireStartY,
                            rulerVisible: this.rulerVisible,
                            ercErrors: this.ercErrors,
                            onStatusChange: (msg: string) => { this.statusMessage = msg; },
                            onDocumentChanged: () => { this.bumpCanvas(); },
                            onCopySelected: () => { this.handleCopy(); },
                            onDeleteSelected: () => { this.handleDeleteSelected(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        rulerVisible: this.rulerVisible,
                        ercErrors: this.ercErrors
                    });
                }
            }, { name: "SchematicCanvas" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.selectedComponentId) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.FloatingToolBar.bind(this)();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Stack.pop();
    }
    FloatingToolBar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.backgroundColor(ProteusColors.CANVAS_BG);
            Row.border({ width: 1, color: ProteusColors.BORDER });
            Row.padding(2);
            Row.margin({ right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                        onAction: () => this.handleRotate() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1566, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.ROTATE,
                            tooltip: '旋转 (R)',
                            showLabel: false,
                            onAction: () => this.handleRotate()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                        onAction: () => this.handleMirror() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1568, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.MIRROR,
                            tooltip: '镜像 (M)',
                            showLabel: false,
                            onAction: () => this.handleMirror()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                        onAction: () => this.handleDeleteSelected() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1570, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.TRASH,
                            tooltip: '删除 (Del)',
                            showLabel: false,
                            onAction: () => this.handleDeleteSelected()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.SETTINGS, tooltip: '属性面板', showLabel: false,
                        onAction: () => {
                            this.rightCollapsed = false;
                            this.uiState.rightCollapsed = false;
                            this.setActiveRightTab(0);
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1572, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.SETTINGS,
                            tooltip: '属性面板',
                            showLabel: false,
                            onAction: () => {
                                this.rightCollapsed = false;
                                this.uiState.rightCollapsed = false;
                                this.setActiveRightTab(0);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.SETTINGS, tooltip: '属性面板', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.debugTabHasBadge) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.PLAY, tooltip: '烧录 HEX', showLabel: false,
                                    onAction: () => {
                                        const doc = this.appService.schematicEditor.getDocument();
                                        const comp = doc.components.find(c => c.id === this.selectedComponentId);
                                        if (comp) {
                                            const lib = comp.libraryId.toUpperCase();
                                            if (lib.startsWith('AT89') || lib.startsWith('STC')) {
                                                this.burnMcuFamily = '8051';
                                            }
                                            else {
                                                this.burnMcuFamily = 'STM32';
                                            }
                                            this.burnFilePath = '';
                                            this.showBurnDialog = true;
                                        }
                                    } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1579, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        iconName: ProteusIconName.PLAY,
                                        tooltip: '烧录 HEX',
                                        showLabel: false,
                                        onAction: () => {
                                            const doc = this.appService.schematicEditor.getDocument();
                                            const comp = doc.components.find(c => c.id === this.selectedComponentId);
                                            if (comp) {
                                                const lib = comp.libraryId.toUpperCase();
                                                if (lib.startsWith('AT89') || lib.startsWith('STC')) {
                                                    this.burnMcuFamily = '8051';
                                                }
                                                else {
                                                    this.burnMcuFamily = 'STM32';
                                                }
                                                this.burnFilePath = '';
                                                this.showBurnDialog = true;
                                            }
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    iconName: ProteusIconName.PLAY, tooltip: '烧录 HEX', showLabel: false
                                });
                            }
                        }, { name: "ProteusToolButton" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Row.pop();
    }
    RightPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.rightPanelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: { left: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, {
                        title: { "id": 83886113, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        collapsed: false,
                        onToggle: () => { this.rightCollapsed = true; this.uiState.rightCollapsed = true; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1605, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: { "id": 83886113, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            collapsed: false,
                            onToggle: () => { this.rightCollapsed = true; this.uiState.rightCollapsed = true; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: { "id": 83886113, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        collapsed: false
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
            // Content area
            if (this.activeRightTab === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new PropertyPanel(this, {
                                    selectedComponentId: this.selectedComponentId,
                                    docVersion: this.canvasVersion,
                                    simWaveTick: this.simWaveTick,
                                    statusMessage: this.__statusMessage,
                                    onDeleted: () => {
                                        this.selectedComponentId = '';
                                        this.selectedCount = 0;
                                        this.bumpCanvas();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1613, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        selectedComponentId: this.selectedComponentId,
                                        docVersion: this.canvasVersion,
                                        simWaveTick: this.simWaveTick,
                                        statusMessage: this.statusMessage,
                                        onDeleted: () => {
                                            this.selectedComponentId = '';
                                            this.selectedCount = 0;
                                            this.bumpCanvas();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    selectedComponentId: this.selectedComponentId,
                                    docVersion: this.canvasVersion,
                                    simWaveTick: this.simWaveTick
                                });
                            }
                        }, { name: "PropertyPanel" });
                    }
                    __Common__.pop();
                });
            }
            else if (this.activeRightTab === 4) {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new InstrumentPanel(this, {
                                    statusMessage: this.__statusMessage,
                                    selectedComponentId: this.selectedComponentId,
                                    simWaveTick: this.simWaveTick
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1627, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        statusMessage: this.statusMessage,
                                        selectedComponentId: this.selectedComponentId,
                                        simWaveTick: this.simWaveTick
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    selectedComponentId: this.selectedComponentId,
                                    simWaveTick: this.simWaveTick
                                });
                            }
                        }, { name: "InstrumentPanel" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(2, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.scrollBar(BarState.Auto);
                    }, Scroll);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.activeRightTab === 1) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create({ space: 8 });
                                    Column.width('100%');
                                    Column.alignItems(HorizontalAlign.Start);
                                    Column.padding({ bottom: 8 });
                                }, Column);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusSectionTitle(this, { title: '仿真控制' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1639, col: 19 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    title: '仿真控制'
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                title: '仿真控制'
                                            });
                                        }
                                    }, { name: "ProteusSectionTitle" });
                                }
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create();
                                    Column.alignItems(HorizontalAlign.Start);
                                    Column.width('100%');
                                    Column.padding({ left: 8 });
                                }, Column);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('仿真状态');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.margin({ bottom: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(this.simRunning ? (this.simPaused ? '已暂停' : '运行中') : '空闲');
                                    Text.fontSize(ProteusFonts.TITLE);
                                    Text.fontColor(this.simRunning ? (this.simPaused ? ProteusColors.ERC_WARN : ProteusColors.ERC_OK) : ProteusColors.TEXT_SECONDARY);
                                    Text.fontWeight(FontWeight.Medium);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    If.create();
                                    if (this.simRunning) {
                                        this.ifElseBranchUpdateFunction(0, () => {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                Text.create('点击下方按钮控制仿真');
                                                Text.fontSize(ProteusFonts.STATUS);
                                                Text.fontColor(ProteusColors.TEXT_SECONDARY);
                                                Text.margin({ top: 2 });
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
                                Column.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create({ space: 8 });
                                    Row.width('100%');
                                    Row.padding({ left: 8, right: 8 });
                                    Row.justifyContent(FlexAlign.SpaceBetween);
                                }, Row);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusClassicBtn(this, {
                                                label: this.simRunning ? { "id": 83886134, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" } : { "id": 83886133, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: this.simRunning ? '停止仿真' : '运行仿真',
                                                widthVal: '42%',
                                                onAction: async () => {
                                                    if (this.simRunning) {
                                                        this.appService.stopSimulation();
                                                        this.simRunning = false;
                                                    }
                                                    else {
                                                        this.applySimStartResult(this.appService.startSimulation());
                                                    }
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1662, col: 21 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: this.simRunning ? { "id": 83886134, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" } : { "id": 83886133, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                    tooltip: this.simRunning ? '停止仿真' : '运行仿真',
                                                    widthVal: '42%',
                                                    onAction: async () => {
                                                        if (this.simRunning) {
                                                            this.appService.stopSimulation();
                                                            this.simRunning = false;
                                                        }
                                                        else {
                                                            this.applySimStartResult(this.appService.startSimulation());
                                                        }
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: this.simRunning ? { "id": 83886134, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" } : { "id": 83886133, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: this.simRunning ? '停止仿真' : '运行仿真',
                                                widthVal: '42%'
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusClassicBtn(this, {
                                                label: { "id": 83886132, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: '暂停/恢复仿真',
                                                widthVal: '42%',
                                                onAction: () => { this.toggleSimPause(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1675, col: 21 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: { "id": 83886132, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                    tooltip: '暂停/恢复仿真',
                                                    widthVal: '42%',
                                                    onAction: () => { this.toggleSimPause(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: { "id": 83886132, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: '暂停/恢复仿真',
                                                widthVal: '42%'
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                                Row.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 4 });
                                }, Divider);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('ERC 检查');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.width('100%');
                                    Text.padding({ left: 8, top: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create();
                                    Row.width('100%');
                                    Row.padding({ left: 8 });
                                    Row.alignItems(VerticalAlign.Center);
                                }, Row);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('错误数:');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(`${this.ercCount}`);
                                    Text.fontSize(ProteusFonts.TITLE);
                                    Text.fontColor(this.ercCount > 0 ? ProteusColors.ERC_ERR : ProteusColors.ERC_OK);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.margin({ left: 4 });
                                }, Text);
                                Text.pop();
                                Row.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    __Common__.create();
                                    __Common__.margin({ left: 8 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusClassicBtn(this, {
                                                label: '运行 ERC 检查',
                                                widthVal: '86%',
                                                onAction: () => {
                                                    const errors = this.appService.runErc(false);
                                                    this.ercErrors = errors;
                                                    const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                                                    this.ercCount = errors.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1709, col: 19 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: '运行 ERC 检查',
                                                    widthVal: '86%',
                                                    onAction: () => {
                                                        const errors = this.appService.runErc(false);
                                                        this.ercErrors = errors;
                                                        const errN = errors.filter(e => e.severity === 'error' || e.severity === 'critical').length;
                                                        this.ercCount = errors.length;
                                                        this.navTab = 3;
                                                        this.statusMessage = `ERC: ${errors.length} issues (${errN} errors)`;
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: '运行 ERC 检查',
                                                widthVal: '86%'
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                                __Common__.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 4 });
                                }, Divider);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('电路统计');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.width('100%');
                                    Text.padding({ left: 8, top: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create({ space: 4 });
                                    Column.alignItems(HorizontalAlign.Start);
                                    Column.width('100%');
                                    Column.padding({ left: 8 });
                                }, Column);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create();
                                }, Row);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('器件:');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.width(48);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(`${this.getDocComponents().length}`);
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                }, Text);
                                Text.pop();
                                Row.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create();
                                }, Row);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('网络:');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.width(48);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(`${this.getDocNets().length}`);
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                }, Text);
                                Text.pop();
                                Row.pop();
                                Column.pop();
                                Column.pop();
                            });
                        }
                        else if (this.activeRightTab === 2) {
                            this.ifElseBranchUpdateFunction(1, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 280 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new AiSettingsPanel(this, { statusMessage: this.__statusMessage }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1760, col: 17 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    statusMessage: this.statusMessage
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {});
                                        }
                                    }, { name: "AiSettingsPanel" });
                                }
                                __Common__.pop();
                            });
                        }
                        else if (this.activeRightTab === 3) {
                            this.ifElseBranchUpdateFunction(2, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 320 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new McuDebugPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1763, col: 17 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    selectedComponentId: this.selectedComponentId
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                selectedComponentId: this.selectedComponentId
                                            });
                                        }
                                    }, { name: "McuDebugPanel" });
                                }
                                __Common__.pop();
                            });
                        }
                        else if (this.activeRightTab === 5) {
                            this.ifElseBranchUpdateFunction(3, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 240 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new FaultInjectionPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1769, col: 17 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    selectedComponentId: this.selectedComponentId
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                selectedComponentId: this.selectedComponentId
                                            });
                                        }
                                    }, { name: "FaultInjectionPanel" });
                                }
                                __Common__.pop();
                            });
                        }
                        else if (this.activeRightTab === 6) {
                            this.ifElseBranchUpdateFunction(4, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 240 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new TeachingPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1775, col: 17 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    selectedComponentId: this.selectedComponentId
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                selectedComponentId: this.selectedComponentId
                                            });
                                        }
                                    }, { name: "TeachingPanel" });
                                }
                                __Common__.pop();
                            });
                        }
                        else if (this.activeRightTab === 7) {
                            this.ifElseBranchUpdateFunction(5, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 320 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new PlatformSettingsPanel(this, { statusMessage: this.__statusMessage, themeRefreshKey: this.__themeRefreshKey }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1781, col: 17 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    themeRefreshKey: this.themeRefreshKey
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {});
                                        }
                                    }, { name: "PlatformSettingsPanel" });
                                }
                                __Common__.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(6, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    Column.pop();
                    Scroll.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Vertical sidebar tab strip
            Column.create();
            // Vertical sidebar tab strip
            Column.width(44);
            // Vertical sidebar tab strip
            Column.height('100%');
            // Vertical sidebar tab strip
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            // Vertical sidebar tab strip
            Column.border({ width: { left: 1 }, color: ProteusColors.SIDEBAR_TAB_BORDER });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '属性', tooltip: '属性面板', icon: ProteusIconName.SETTINGS,
                        selected: this.activeRightTab === 0,
                        onSelect: () => { this.setActiveRightTab(0); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1793, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '属性',
                            tooltip: '属性面板',
                            icon: ProteusIconName.SETTINGS,
                            selected: this.activeRightTab === 0,
                            onSelect: () => { this.setActiveRightTab(0); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '属性', tooltip: '属性面板', icon: ProteusIconName.SETTINGS,
                        selected: this.activeRightTab === 0
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '仿真', tooltip: '仿真控制', icon: ProteusIconName.PLAY,
                        selected: this.activeRightTab === 1,
                        onSelect: () => { this.setActiveRightTab(1); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1798, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '仿真',
                            tooltip: '仿真控制',
                            icon: ProteusIconName.PLAY,
                            selected: this.activeRightTab === 1,
                            onSelect: () => { this.setActiveRightTab(1); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '仿真', tooltip: '仿真控制', icon: ProteusIconName.PLAY,
                        selected: this.activeRightTab === 1
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: 'AI', tooltip: 'AI 助手', icon: ProteusIconName.AI_ROUTE,
                        selected: this.activeRightTab === 2,
                        onSelect: () => { this.setActiveRightTab(2); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1803, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'AI',
                            tooltip: 'AI 助手',
                            icon: ProteusIconName.AI_ROUTE,
                            selected: this.activeRightTab === 2,
                            onSelect: () => { this.setActiveRightTab(2); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'AI', tooltip: 'AI 助手', icon: ProteusIconName.AI_ROUTE,
                        selected: this.activeRightTab === 2
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
        }, Stack);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '调试', tooltip: 'MCU 调试', icon: ProteusIconName.COMPONENT,
                        selected: this.activeRightTab === 3,
                        onSelect: () => { this.setActiveRightTab(3); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1809, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '调试',
                            tooltip: 'MCU 调试',
                            icon: ProteusIconName.COMPONENT,
                            selected: this.activeRightTab === 3,
                            onSelect: () => { this.setActiveRightTab(3); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '调试', tooltip: 'MCU 调试', icon: ProteusIconName.COMPONENT,
                        selected: this.activeRightTab === 3
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.debugTabHasBadge) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('●');
                        Text.fontSize(7);
                        Text.fontColor(ProteusColors.ERC_ERR);
                        Text.position({ x: 28, y: 4 });
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
        Stack.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '仪器', tooltip: '虚拟仪器', icon: ProteusIconName.ZOOM_IN,
                        selected: this.activeRightTab === 4,
                        onSelect: () => { this.setActiveRightTab(4); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1821, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '仪器',
                            tooltip: '虚拟仪器',
                            icon: ProteusIconName.ZOOM_IN,
                            selected: this.activeRightTab === 4,
                            onSelect: () => { this.setActiveRightTab(4); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '仪器', tooltip: '虚拟仪器', icon: ProteusIconName.ZOOM_IN,
                        selected: this.activeRightTab === 4
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '故障', tooltip: '故障注入', icon: ProteusIconName.WARNING,
                        selected: this.activeRightTab === 5,
                        onSelect: () => { this.setActiveRightTab(5); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1826, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '故障',
                            tooltip: '故障注入',
                            icon: ProteusIconName.WARNING,
                            selected: this.activeRightTab === 5,
                            onSelect: () => { this.setActiveRightTab(5); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '故障', tooltip: '故障注入', icon: ProteusIconName.WARNING,
                        selected: this.activeRightTab === 5
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '教学', tooltip: '教学助手', icon: ProteusIconName.LABEL,
                        selected: this.activeRightTab === 6,
                        onSelect: () => { this.setActiveRightTab(6); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1831, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '教学',
                            tooltip: '教学助手',
                            icon: ProteusIconName.LABEL,
                            selected: this.activeRightTab === 6,
                            onSelect: () => { this.setActiveRightTab(6); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '教学', tooltip: '教学助手', icon: ProteusIconName.LABEL,
                        selected: this.activeRightTab === 6
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '设置', tooltip: '平台设置', icon: ProteusIconName.GRID,
                        selected: this.activeRightTab === 7,
                        onSelect: () => { this.setActiveRightTab(7); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1836, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '设置',
                            tooltip: '平台设置',
                            icon: ProteusIconName.GRID,
                            selected: this.activeRightTab === 7,
                            onSelect: () => { this.setActiveRightTab(7); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '设置', tooltip: '平台设置', icon: ProteusIconName.GRID,
                        selected: this.activeRightTab === 7
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        // Vertical sidebar tab strip
        Column.pop();
        Row.pop();
        Column.pop();
    }
    /** Welcome dialog — shown on first launch when no prior session exists */
    WelcomeDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000080');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(340);
            Column.padding(24);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 12, color: '#00000060' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('欢迎使用 AI 原理图仿真');
            Text.fontSize(18);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Bold);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('请先新建工程或打开已有工程');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`工程目录: ${this.userProjectDir}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 16 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 12 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '新建工程',
                        widthVal: '48%',
                        onAction: () => { this.handleNewProject(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1876, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '新建工程',
                            widthVal: '48%',
                            onAction: () => { this.handleNewProject(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '新建工程',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '打开工程',
                        widthVal: '48%',
                        onAction: () => { void this.handleOpenProject(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1881, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '打开工程',
                            widthVal: '48%',
                            onAction: () => { void this.handleOpenProject(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '打开工程',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    /** New project name input dialog */
    NewProjectDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showNewProjectDialog = false; });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(340);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('新建工程');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('请输入工程名称（保存至 project 目录）');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.userProjectDir);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ placeholder: 'MyProject', text: this.newProjectNameInput });
            TextInput.width('100%');
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((v: string) => { this.newProjectNameInput = v; });
            TextInput.onSubmit(() => { this.doCreateNewProject(); });
        }, TextInput);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '48%',
                        onAction: () => {
                            this.showNewProjectDialog = false;
                            this.showWelcomeDialog = true;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1932, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '取消',
                            widthVal: '48%',
                            onAction: () => {
                                this.showNewProjectDialog = false;
                                this.showWelcomeDialog = true;
                            }
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
                        label: '创建',
                        widthVal: '48%',
                        onAction: () => { this.doCreateNewProject(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1940, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '创建',
                            widthVal: '48%',
                            onAction: () => { this.doCreateNewProject(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '创建',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    /** Recovery dialog — shown when unsaved recovery files are detected */
    RecoveryDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(380);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('检测到未正常关闭的工程');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.ERC_WARN);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('上次软件未正常关闭，以下工程可尝试恢复');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 12 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // List recovery files
            List.create({ space: 4 });
            // List recovery files
            List.height(80);
            // List recovery files
            List.width('100%');
            // List recovery files
            List.margin({ bottom: 12 });
        }, List);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = (_item, _idx: number) => {
                const file = _item;
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
                            Row.padding(8);
                            Row.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        }, Row);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Text.create(file);
                            Text.fontSize(ProteusFonts.PARAM_KEY);
                            Text.fontColor(ProteusColors.TEXT_PRIMARY);
                            Text.fontFamily('monospace');
                            Text.layoutWeight(1);
                            Text.maxLines(1);
                            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                        }, Text);
                        Text.pop();
                        Row.pop();
                        ListItem.pop();
                    };
                    this.observeComponentCreation2(itemCreation2, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(elmtId, this.recoveryFiles, forEachItemGenFunction, (file: string) => file, true, false);
        }, ForEach);
        ForEach.pop();
        // List recovery files
        List.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '忽略',
                        widthVal: '32%',
                        onAction: () => {
                            this.showRecoveryDialog = false;
                            this.showWelcomeDialog = true;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2000, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '忽略',
                            widthVal: '32%',
                            onAction: () => {
                                this.showRecoveryDialog = false;
                                this.showWelcomeDialog = true;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '忽略',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '恢复最新',
                        widthVal: '32%',
                        onAction: () => {
                            void this.doRecoverLatest();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2008, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '恢复最新',
                            widthVal: '32%',
                            onAction: () => {
                                void this.doRecoverLatest();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '恢复最新',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '新建工程',
                        widthVal: '32%',
                        onAction: () => {
                            this.showRecoveryDialog = false;
                            this.handleNewProject();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2015, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '新建工程',
                            widthVal: '32%',
                            onAction: () => {
                                this.showRecoveryDialog = false;
                                this.handleNewProject();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '新建工程',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    async doRecoverLatest(): Promise<void> {
        if (this.recoveryFiles.length === 0)
            return;
        // Load the most recently modified recovery file (first in list)
        const path = this.recoveryFiles[this.recoveryFiles.length - 1];
        const ok = await this.appService.loadProject(path);
        if (ok) {
            this.projectName = this.appService.currentProject?.name ?? 'Recovered';
            const name = this.projectName;
            this.appService.disableAutoSave();
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`, 120000);
            this.resetAfterProjectChange();
            this.appService.schematicEditor.fitAllInView();
            this.refreshComponentList();
            this.showRecoveryDialog = false;
            this.statusMessage = `已恢复工程: ${name}`;
        }
        else {
            this.statusMessage = '恢复失败，请尝试手动打开';
        }
    }
    FileOpenDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showOpenDialog = false; });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(320);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('打开工程文件');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('请输入 .schsim 工程文件路径（默认在应用沙箱 project 目录）');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.userProjectDir);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ placeholder: `${this.userProjectDir}/MyProject.schsim`, text: this.openFilePath });
            TextInput.width('100%');
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((v: string) => { this.openFilePath = v; });
        }, TextInput);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '32%',
                        onAction: () => { this.showOpenDialog = false; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2087, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '取消',
                            widthVal: '32%',
                            onAction: () => { this.showOpenDialog = false; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '取消',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '浏览',
                        widthVal: '32%',
                        onAction: () => { void this.handleOpenFromPicker(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2092, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '浏览',
                            widthVal: '32%',
                            onAction: () => { void this.handleOpenFromPicker(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '浏览',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '打开',
                        widthVal: '32%',
                        onAction: () => { void this.doOpenFromPath(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2097, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '打开',
                            widthVal: '32%',
                            onAction: () => { void this.doOpenFromPath(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '打开',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    FileSaveAsDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showSaveAsDialog = false; });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(320);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('另存为');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('请输入保存路径（默认在应用沙箱 project 目录）');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.userProjectDir);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ placeholder: `${this.userProjectDir}/${this.projectName}.schsim`, text: this.saveAsPath });
            TextInput.width('100%');
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((v: string) => { this.saveAsPath = v; });
        }, TextInput);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '48%',
                        onAction: () => { this.showSaveAsDialog = false; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2148, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '取消',
                            widthVal: '48%',
                            onAction: () => { this.showSaveAsDialog = false; }
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
                        label: '保存',
                        widthVal: '48%',
                        onAction: () => { void this.doSaveAsFromPath(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2153, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '保存',
                            widthVal: '48%',
                            onAction: () => { void this.doSaveAsFromPath(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '保存',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    BurnHexDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showBurnDialog = false; });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(380);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`烧录 HEX 到 MCU`);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('选择编译生成的 .hex 文件烧录到当前选中的 MCU');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // MCU family selector
            Row.create();
            // MCU family selector
            Row.width('100%');
            // MCU family selector
            Row.margin({ bottom: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('目标架构:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(64);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '8051',
                        widthVal: 52,
                        onAction: () => { this.burnMcuFamily = '8051'; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2196, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '8051',
                            widthVal: 52,
                            onAction: () => { this.burnMcuFamily = '8051'; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '8051',
                        widthVal: 52
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: 'STM32',
                        widthVal: 52,
                        onAction: () => { this.burnMcuFamily = 'STM32'; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2201, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'STM32',
                            widthVal: 52,
                            onAction: () => { this.burnMcuFamily = 'STM32'; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'STM32',
                        widthVal: 52
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`当前: ${this.burnMcuFamily === '8051' ? '8051' : 'STM32F1'}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.ERC_OK);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ left: 4 });
        }, Text);
        Text.pop();
        // MCU family selector
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // File path input
            Row.create();
            // File path input
            Row.width('100%');
            // File path input
            Row.margin({ bottom: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ placeholder: '/path/to/firmware.hex', text: this.burnFilePath });
            TextInput.layoutWeight(1);
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((v: string) => { this.burnFilePath = v; });
        }, TextInput);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '浏览',
                        widthVal: 60,
                        onAction: () => { void this.doBrowseHexFile(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2226, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '浏览',
                            widthVal: 60,
                            onAction: () => { void this.doBrowseHexFile(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '浏览',
                        widthVal: 60
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        // File path input
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Reset vector / Entry point
            Row.create();
            // Reset vector / Entry point
            Row.width('100%');
            // Reset vector / Entry point
            Row.margin({ bottom: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('入口地址:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(64);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ text: this.burnEntryPoint, placeholder: '0x0000' });
            TextInput.layoutWeight(1);
            TextInput.height(28);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.fontFamily('monospace');
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((v: string) => { this.burnEntryPoint = v; });
        }, TextInput);
        // Reset vector / Entry point
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // Firmware info (shown after successful burn)
            if (this.burnFirmwareInfo.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.margin({ bottom: 8 });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.burnFirmwareInfo);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_OK);
                        Text.fontWeight(FontWeight.Medium);
                        Text.maxLines(2);
                        Text.width('100%');
                        Text.padding(6);
                        Text.backgroundColor('#0a2a0a');
                        Text.border({ width: 1, color: '#30a030' });
                    }, Text);
                    Text.pop();
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
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '48%',
                        onAction: () => {
                            this.showBurnDialog = false;
                            this.burnFirmwareInfo = '';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2273, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '取消',
                            widthVal: '48%',
                            onAction: () => {
                                this.showBurnDialog = false;
                                this.burnFirmwareInfo = '';
                            }
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
                        label: '烧录',
                        widthVal: '48%',
                        onAction: () => { void this.doBurnHex(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2281, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '烧录',
                            widthVal: '48%',
                            onAction: () => { void this.doBurnHex(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '烧录',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    /** Exit confirmation dialog — shown when user presses back with unsaved changes */
    ExitConfirmDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showExitConfirmDialog = false; });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(380);
            Column.padding(24);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('未保存的更改');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('当前工程有未保存的更改，是否保存？');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 16 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '30%',
                        onAction: () => { this.showExitConfirmDialog = false; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2319, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '取消',
                            widthVal: '30%',
                            onAction: () => { this.showExitConfirmDialog = false; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '取消',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '不保存',
                        widthVal: '30%',
                        onAction: () => {
                            this.unsavedChanges = false;
                            this.showExitConfirmDialog = false;
                            void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2324, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '不保存',
                            widthVal: '30%',
                            onAction: () => {
                                this.unsavedChanges = false;
                                this.showExitConfirmDialog = false;
                                void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '不保存',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '保存',
                        widthVal: '30%',
                        onAction: () => {
                            this.showExitConfirmDialog = false;
                            void this.handleSaveProject().then(() => {
                                if (!this.unsavedChanges) {
                                    void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
                                }
                            });
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2333, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '保存',
                            widthVal: '30%',
                            onAction: () => {
                                this.showExitConfirmDialog = false;
                                void this.handleSaveProject().then(() => {
                                    if (!this.unsavedChanges) {
                                        void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
                                    }
                                });
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '保存',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Column.pop();
    }
    StatusBar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.STATUS_HEIGHT);
            Row.padding({ left: 8, right: 8 });
            Row.backgroundColor(ProteusColors.STATUS_BAR_BG);
            Row.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Left group: mode + coords + grid + sel
            Text.create(`[${toolModeLabel(this.toolMode)}]`);
            // Left group: mode + coords + grid + sel
            Text.fontSize(ProteusFonts.STATUS);
            // Left group: mode + coords + grid + sel
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            // Left group: mode + coords + grid + sel
            Text.margin({ right: 8 });
        }, Text);
        // Left group: mode + coords + grid + sel
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`X:${this.mouseX} Y:${this.mouseY}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`Grid:${this.appService.schematicEditor.getViewport().gridSize}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`Sel:${this.selectedCount}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(this.selectedCount > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusVDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2384, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {};
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {});
                }
            }, { name: "ProteusVDivider" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Center group: status message + AI progress
            Text.create(this.statusMessage);
            // Center group: status message + AI progress
            Text.fontSize(ProteusFonts.STATUS);
            // Center group: status message + AI progress
            Text.fontColor(ProteusColors.TEXT_LABEL);
            // Center group: status message + AI progress
            Text.maxLines(1);
            // Center group: status message + AI progress
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            // Center group: status message + AI progress
            Text.layoutWeight(1);
            // Center group: status message + AI progress
            Text.margin({ left: 8, right: 8 });
        }, Text);
        // Center group: status message + AI progress
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiProgress > 0 && this.aiProgress < 100) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${this.aiStage} ${this.aiProgress}%`);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_WARN);
                        Text.margin({ right: 8 });
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
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusVDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2401, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {};
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {});
                }
            }, { name: "ProteusVDivider" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // Right group: ERC + sim + zoom
            if (this.ercCount === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`ERC:0 ✓`);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_OK);
                        Text.margin({ left: 8, right: 8 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`ERC:${this.ercCount}`);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_WARN);
                        Text.margin({ left: 8, right: 8 });
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.simRunning ? (this.simPaused ? 'Sim:Paused' : 'Sim:Running') : 'Sim:Idle');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(this.simRunning ? ProteusColors.ERC_OK : ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`${this.zoomPercent}%`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
    static getEntryName(): string {
        return "Index";
    }
}
registerNamedRoute(() => new Index(undefined, {}), "", { bundleName: "com.elecdraw.aischsim", moduleName: "entry", pagePath: "pages/Index", pageFullPath: "entry/src/main/ets/pages/Index", integratedHsp: "false", moduleType: "followWithHap" });
