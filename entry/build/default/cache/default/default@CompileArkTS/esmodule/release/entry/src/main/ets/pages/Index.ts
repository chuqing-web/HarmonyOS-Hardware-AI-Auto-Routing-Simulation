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
import { ProteusVDivider, ProteusPanelTitle, ProteusNavTab, ProteusTreeRow, ProteusClassicBtn, ProteusSectionTitle, ProteusMenuTrigger, ProteusToolButton, ProteusToolGroup, ProteusResizer, ProteusSidebarTab } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import type { ProteusMenuEntry } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { UiStateStore } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/UiStateStore";
import { CallbackRegistry, ComponentCategory, EventBus, ModuleEvent, McuFamily, isInstrumentLibraryId } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
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
    constructor(o219, p219, q219, r219 = -1, s219 = undefined, t219) {
        super(o219, q219, r219, t219);
        if (typeof s219 === "function") {
            this.paramsGenerator_ = s219;
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
        this.onSchematicChanged = (u219: ModuleEventPayload): void => {
            this.navRefreshKey++;
            this.unsavedChanges = true;
            this.canvasVersion++;
        };
        this.setInitiallyProvidedValue(p219);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(n219: Index_Params) {
        if (n219.projectName !== undefined) {
            this.projectName = n219.projectName;
        }
        if (n219.simRunning !== undefined) {
            this.simRunning = n219.simRunning;
        }
        if (n219.simPaused !== undefined) {
            this.simPaused = n219.simPaused;
        }
        if (n219.simWaveTick !== undefined) {
            this.simWaveTick = n219.simWaveTick;
        }
        if (n219.statusMessage !== undefined) {
            this.statusMessage = n219.statusMessage;
        }
        if (n219.canvasVersion !== undefined) {
            this.canvasVersion = n219.canvasVersion;
        }
        if (n219.selectedComponentId !== undefined) {
            this.selectedComponentId = n219.selectedComponentId;
        }
        if (n219.searchKeyword !== undefined) {
            this.searchKeyword = n219.searchKeyword;
        }
        if (n219.componentList !== undefined) {
            this.componentList = n219.componentList;
        }
        if (n219.ercCount !== undefined) {
            this.ercCount = n219.ercCount;
        }
        if (n219.ercErrors !== undefined) {
            this.ercErrors = n219.ercErrors;
        }
        if (n219.aiProgress !== undefined) {
            this.aiProgress = n219.aiProgress;
        }
        if (n219.aiStage !== undefined) {
            this.aiStage = n219.aiStage;
        }
        if (n219.mouseX !== undefined) {
            this.mouseX = n219.mouseX;
        }
        if (n219.mouseY !== undefined) {
            this.mouseY = n219.mouseY;
        }
        if (n219.zoomPercent !== undefined) {
            this.zoomPercent = n219.zoomPercent;
        }
        if (n219.gridVisible !== undefined) {
            this.gridVisible = n219.gridVisible;
        }
        if (n219.rulerVisible !== undefined) {
            this.rulerVisible = n219.rulerVisible;
        }
        if (n219.selectedCount !== undefined) {
            this.selectedCount = n219.selectedCount;
        }
        if (n219.selectedWireActive !== undefined) {
            this.selectedWireActive = n219.selectedWireActive;
        }
        if (n219.navTab !== undefined) {
            this.navTab = n219.navTab;
        }
        if (n219.leftLibCollapsed !== undefined) {
            this.leftLibCollapsed = n219.leftLibCollapsed;
        }
        if (n219.leftNavCollapsed !== undefined) {
            this.leftNavCollapsed = n219.leftNavCollapsed;
        }
        if (n219.rightCollapsed !== undefined) {
            this.rightCollapsed = n219.rightCollapsed;
        }
        if (n219.activeRightTab !== undefined) {
            this.activeRightTab = n219.activeRightTab;
        }
        if (n219.leftPanelWidth !== undefined) {
            this.leftPanelWidth = n219.leftPanelWidth;
        }
        if (n219.rightPanelWidth !== undefined) {
            this.rightPanelWidth = n219.rightPanelWidth;
        }
        if (n219.debugTabHasBadge !== undefined) {
            this.debugTabHasBadge = n219.debugTabHasBadge;
        }
        if (n219.instrTabHasBadge !== undefined) {
            this.instrTabHasBadge = n219.instrTabHasBadge;
        }
        if (n219.categoryNodes !== undefined) {
            this.categoryNodes = n219.categoryNodes;
        }
        if (n219.themeRefreshKey !== undefined) {
            this.themeRefreshKey = n219.themeRefreshKey;
        }
        if (n219.expandedCategories !== undefined) {
            this.expandedCategories = n219.expandedCategories;
        }
        if (n219.selectedTreeItem !== undefined) {
            this.selectedTreeItem = n219.selectedTreeItem;
        }
        if (n219.previewComponentId !== undefined) {
            this.previewComponentId = n219.previewComponentId;
        }
        if (n219.toolMode !== undefined) {
            this.toolMode = n219.toolMode;
        }
        if (n219.showOpenDialog !== undefined) {
            this.showOpenDialog = n219.showOpenDialog;
        }
        if (n219.openFilePath !== undefined) {
            this.openFilePath = n219.openFilePath;
        }
        if (n219.showSaveAsDialog !== undefined) {
            this.showSaveAsDialog = n219.showSaveAsDialog;
        }
        if (n219.saveAsPath !== undefined) {
            this.saveAsPath = n219.saveAsPath;
        }
        if (n219.showBurnDialog !== undefined) {
            this.showBurnDialog = n219.showBurnDialog;
        }
        if (n219.burnFilePath !== undefined) {
            this.burnFilePath = n219.burnFilePath;
        }
        if (n219.burnMcuFamily !== undefined) {
            this.burnMcuFamily = n219.burnMcuFamily;
        }
        if (n219.burnFirmwareInfo !== undefined) {
            this.burnFirmwareInfo = n219.burnFirmwareInfo;
        }
        if (n219.burnSegmentInfo !== undefined) {
            this.burnSegmentInfo = n219.burnSegmentInfo;
        }
        if (n219.burnEntryPoint !== undefined) {
            this.burnEntryPoint = n219.burnEntryPoint;
        }
        if (n219.burnFileSize !== undefined) {
            this.burnFileSize = n219.burnFileSize;
        }
        if (n219.wireStartActive !== undefined) {
            this.wireStartActive = n219.wireStartActive;
        }
        if (n219.wireStartX !== undefined) {
            this.wireStartX = n219.wireStartX;
        }
        if (n219.wireStartY !== undefined) {
            this.wireStartY = n219.wireStartY;
        }
        if (n219.navRefreshKey !== undefined) {
            this.navRefreshKey = n219.navRefreshKey;
        }
        if (n219.showWelcomeDialog !== undefined) {
            this.showWelcomeDialog = n219.showWelcomeDialog;
        }
        if (n219.showNewProjectDialog !== undefined) {
            this.showNewProjectDialog = n219.showNewProjectDialog;
        }
        if (n219.newProjectNameInput !== undefined) {
            this.newProjectNameInput = n219.newProjectNameInput;
        }
        if (n219.showRecoveryDialog !== undefined) {
            this.showRecoveryDialog = n219.showRecoveryDialog;
        }
        if (n219.recoveryFiles !== undefined) {
            this.recoveryFiles = n219.recoveryFiles;
        }
        if (n219.appInitialized !== undefined) {
            this.appInitialized = n219.appInitialized;
        }
        if (n219.unsavedChanges !== undefined) {
            this.unsavedChanges = n219.unsavedChanges;
        }
        if (n219.showExitConfirmDialog !== undefined) {
            this.showExitConfirmDialog = n219.showExitConfirmDialog;
        }
        if (n219.clipboardLibId !== undefined) {
            this.clipboardLibId = n219.clipboardLibId;
        }
        if (n219.clipboardDeviceIds !== undefined) {
            this.clipboardDeviceIds = n219.clipboardDeviceIds;
        }
        if (n219.userProjectDir !== undefined) {
            this.userProjectDir = n219.userProjectDir;
        }
        if (n219.modifierKeys !== undefined) {
            this.modifierKeys = n219.modifierKeys;
        }
        if (n219.appService !== undefined) {
            this.appService = n219.appService;
        }
        if (n219.vm !== undefined) {
            this.vm = n219.vm;
        }
        if (n219.uiState !== undefined) {
            this.uiState = n219.uiState;
        }
        if (n219.startupRefitDeadline !== undefined) {
            this.startupRefitDeadline = n219.startupRefitDeadline;
        }
        if (n219.windowResizeHooked !== undefined) {
            this.windowResizeHooked = n219.windowResizeHooked;
        }
        if (n219.onSchematicChanged !== undefined) {
            this.onSchematicChanged = n219.onSchematicChanged;
        }
    }
    updateStateVars(m219: Index_Params) {
    }
    purgeVariableDependenciesOnElmtId(l219) {
        this.__projectName.purgeDependencyOnElmtId(l219);
        this.__simRunning.purgeDependencyOnElmtId(l219);
        this.__simPaused.purgeDependencyOnElmtId(l219);
        this.__simWaveTick.purgeDependencyOnElmtId(l219);
        this.__statusMessage.purgeDependencyOnElmtId(l219);
        this.__canvasVersion.purgeDependencyOnElmtId(l219);
        this.__selectedComponentId.purgeDependencyOnElmtId(l219);
        this.__searchKeyword.purgeDependencyOnElmtId(l219);
        this.__componentList.purgeDependencyOnElmtId(l219);
        this.__ercCount.purgeDependencyOnElmtId(l219);
        this.__ercErrors.purgeDependencyOnElmtId(l219);
        this.__aiProgress.purgeDependencyOnElmtId(l219);
        this.__aiStage.purgeDependencyOnElmtId(l219);
        this.__mouseX.purgeDependencyOnElmtId(l219);
        this.__mouseY.purgeDependencyOnElmtId(l219);
        this.__zoomPercent.purgeDependencyOnElmtId(l219);
        this.__gridVisible.purgeDependencyOnElmtId(l219);
        this.__rulerVisible.purgeDependencyOnElmtId(l219);
        this.__selectedCount.purgeDependencyOnElmtId(l219);
        this.__selectedWireActive.purgeDependencyOnElmtId(l219);
        this.__navTab.purgeDependencyOnElmtId(l219);
        this.__leftLibCollapsed.purgeDependencyOnElmtId(l219);
        this.__leftNavCollapsed.purgeDependencyOnElmtId(l219);
        this.__rightCollapsed.purgeDependencyOnElmtId(l219);
        this.__activeRightTab.purgeDependencyOnElmtId(l219);
        this.__leftPanelWidth.purgeDependencyOnElmtId(l219);
        this.__rightPanelWidth.purgeDependencyOnElmtId(l219);
        this.__debugTabHasBadge.purgeDependencyOnElmtId(l219);
        this.__instrTabHasBadge.purgeDependencyOnElmtId(l219);
        this.__categoryNodes.purgeDependencyOnElmtId(l219);
        this.__themeRefreshKey.purgeDependencyOnElmtId(l219);
        this.__expandedCategories.purgeDependencyOnElmtId(l219);
        this.__selectedTreeItem.purgeDependencyOnElmtId(l219);
        this.__previewComponentId.purgeDependencyOnElmtId(l219);
        this.__toolMode.purgeDependencyOnElmtId(l219);
        this.__showOpenDialog.purgeDependencyOnElmtId(l219);
        this.__openFilePath.purgeDependencyOnElmtId(l219);
        this.__showSaveAsDialog.purgeDependencyOnElmtId(l219);
        this.__saveAsPath.purgeDependencyOnElmtId(l219);
        this.__showBurnDialog.purgeDependencyOnElmtId(l219);
        this.__burnFilePath.purgeDependencyOnElmtId(l219);
        this.__burnMcuFamily.purgeDependencyOnElmtId(l219);
        this.__burnFirmwareInfo.purgeDependencyOnElmtId(l219);
        this.__burnSegmentInfo.purgeDependencyOnElmtId(l219);
        this.__burnEntryPoint.purgeDependencyOnElmtId(l219);
        this.__burnFileSize.purgeDependencyOnElmtId(l219);
        this.__wireStartActive.purgeDependencyOnElmtId(l219);
        this.__wireStartX.purgeDependencyOnElmtId(l219);
        this.__wireStartY.purgeDependencyOnElmtId(l219);
        this.__navRefreshKey.purgeDependencyOnElmtId(l219);
        this.__showWelcomeDialog.purgeDependencyOnElmtId(l219);
        this.__showNewProjectDialog.purgeDependencyOnElmtId(l219);
        this.__newProjectNameInput.purgeDependencyOnElmtId(l219);
        this.__showRecoveryDialog.purgeDependencyOnElmtId(l219);
        this.__recoveryFiles.purgeDependencyOnElmtId(l219);
        this.__appInitialized.purgeDependencyOnElmtId(l219);
        this.__unsavedChanges.purgeDependencyOnElmtId(l219);
        this.__showExitConfirmDialog.purgeDependencyOnElmtId(l219);
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
    set projectName(k219: string) {
        this.__projectName.set(k219);
    }
    private __simRunning: ObservedPropertySimplePU<boolean>;
    get simRunning() {
        return this.__simRunning.get();
    }
    set simRunning(j219: boolean) {
        this.__simRunning.set(j219);
    }
    private __simPaused: ObservedPropertySimplePU<boolean>;
    get simPaused() {
        return this.__simPaused.get();
    }
    set simPaused(i219: boolean) {
        this.__simPaused.set(i219);
    }
    private __simWaveTick: ObservedPropertySimplePU<number>;
    get simWaveTick() {
        return this.__simWaveTick.get();
    }
    set simWaveTick(h219: number) {
        this.__simWaveTick.set(h219);
    }
    private __statusMessage: ObservedPropertySimplePU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(g219: string) {
        this.__statusMessage.set(g219);
    }
    private __canvasVersion: ObservedPropertySimplePU<number>;
    get canvasVersion() {
        return this.__canvasVersion.get();
    }
    set canvasVersion(f219: number) {
        this.__canvasVersion.set(f219);
    }
    private __selectedComponentId: ObservedPropertySimplePU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(e219: string) {
        this.__selectedComponentId.set(e219);
    }
    private __searchKeyword: ObservedPropertySimplePU<string>;
    get searchKeyword() {
        return this.__searchKeyword.get();
    }
    set searchKeyword(d219: string) {
        this.__searchKeyword.set(d219);
    }
    private __componentList: ObservedPropertyObjectPU<string[]>;
    get componentList() {
        return this.__componentList.get();
    }
    set componentList(c219: string[]) {
        this.__componentList.set(c219);
    }
    private __ercCount: ObservedPropertySimplePU<number>;
    get ercCount() {
        return this.__ercCount.get();
    }
    set ercCount(b219: number) {
        this.__ercCount.set(b219);
    }
    private __ercErrors: ObservedPropertyObjectPU<ErcError[]>;
    get ercErrors() {
        return this.__ercErrors.get();
    }
    set ercErrors(a219: ErcError[]) {
        this.__ercErrors.set(a219);
    }
    private __aiProgress: ObservedPropertySimplePU<number>;
    get aiProgress() {
        return this.__aiProgress.get();
    }
    set aiProgress(z218: number) {
        this.__aiProgress.set(z218);
    }
    private __aiStage: ObservedPropertySimplePU<string>;
    get aiStage() {
        return this.__aiStage.get();
    }
    set aiStage(y218: string) {
        this.__aiStage.set(y218);
    }
    private __mouseX: ObservedPropertySimplePU<number>;
    get mouseX() {
        return this.__mouseX.get();
    }
    set mouseX(x218: number) {
        this.__mouseX.set(x218);
    }
    private __mouseY: ObservedPropertySimplePU<number>;
    get mouseY() {
        return this.__mouseY.get();
    }
    set mouseY(w218: number) {
        this.__mouseY.set(w218);
    }
    private __zoomPercent: ObservedPropertySimplePU<number>;
    get zoomPercent() {
        return this.__zoomPercent.get();
    }
    set zoomPercent(v218: number) {
        this.__zoomPercent.set(v218);
    }
    private __gridVisible: ObservedPropertySimplePU<boolean>;
    get gridVisible() {
        return this.__gridVisible.get();
    }
    set gridVisible(u218: boolean) {
        this.__gridVisible.set(u218);
    }
    private __rulerVisible: ObservedPropertySimplePU<boolean>;
    get rulerVisible() {
        return this.__rulerVisible.get();
    }
    set rulerVisible(t218: boolean) {
        this.__rulerVisible.set(t218);
    }
    private __selectedCount: ObservedPropertySimplePU<number>;
    get selectedCount() {
        return this.__selectedCount.get();
    }
    set selectedCount(s218: number) {
        this.__selectedCount.set(s218);
    }
    private __selectedWireActive: ObservedPropertySimplePU<boolean>;
    get selectedWireActive() {
        return this.__selectedWireActive.get();
    }
    set selectedWireActive(r218: boolean) {
        this.__selectedWireActive.set(r218);
    }
    private __navTab: ObservedPropertySimplePU<number>;
    get navTab() {
        return this.__navTab.get();
    }
    set navTab(q218: number) {
        this.__navTab.set(q218);
    }
    private __leftLibCollapsed: ObservedPropertySimplePU<boolean>;
    get leftLibCollapsed() {
        return this.__leftLibCollapsed.get();
    }
    set leftLibCollapsed(p218: boolean) {
        this.__leftLibCollapsed.set(p218);
    }
    private __leftNavCollapsed: ObservedPropertySimplePU<boolean>;
    get leftNavCollapsed() {
        return this.__leftNavCollapsed.get();
    }
    set leftNavCollapsed(o218: boolean) {
        this.__leftNavCollapsed.set(o218);
    }
    private __rightCollapsed: ObservedPropertySimplePU<boolean>;
    get rightCollapsed() {
        return this.__rightCollapsed.get();
    }
    set rightCollapsed(n218: boolean) {
        this.__rightCollapsed.set(n218);
    }
    private __activeRightTab: ObservedPropertySimplePU<number>;
    get activeRightTab() {
        return this.__activeRightTab.get();
    }
    set activeRightTab(m218: number) {
        this.__activeRightTab.set(m218);
    }
    private __leftPanelWidth: ObservedPropertySimplePU<number>;
    get leftPanelWidth() {
        return this.__leftPanelWidth.get();
    }
    set leftPanelWidth(l218: number) {
        this.__leftPanelWidth.set(l218);
    }
    private __rightPanelWidth: ObservedPropertySimplePU<number>;
    get rightPanelWidth() {
        return this.__rightPanelWidth.get();
    }
    set rightPanelWidth(k218: number) {
        this.__rightPanelWidth.set(k218);
    }
    private __debugTabHasBadge: ObservedPropertySimplePU<boolean>;
    get debugTabHasBadge() {
        return this.__debugTabHasBadge.get();
    }
    set debugTabHasBadge(j218: boolean) {
        this.__debugTabHasBadge.set(j218);
    }
    private __instrTabHasBadge: ObservedPropertySimplePU<boolean>;
    get instrTabHasBadge() {
        return this.__instrTabHasBadge.get();
    }
    set instrTabHasBadge(i218: boolean) {
        this.__instrTabHasBadge.set(i218);
    }
    private __categoryNodes: ObservedPropertyObjectPU<CategoryNode[]>;
    get categoryNodes() {
        return this.__categoryNodes.get();
    }
    set categoryNodes(h218: CategoryNode[]) {
        this.__categoryNodes.set(h218);
    }
    private __themeRefreshKey: ObservedPropertySimplePU<number>;
    get themeRefreshKey() {
        return this.__themeRefreshKey.get();
    }
    set themeRefreshKey(g218: number) {
        this.__themeRefreshKey.set(g218);
    }
    private __expandedCategories: ObservedPropertyObjectPU<Set<ComponentCategory>>;
    get expandedCategories() {
        return this.__expandedCategories.get();
    }
    set expandedCategories(f218: Set<ComponentCategory>) {
        this.__expandedCategories.set(f218);
    }
    private __selectedTreeItem: ObservedPropertySimplePU<string>;
    get selectedTreeItem() {
        return this.__selectedTreeItem.get();
    }
    set selectedTreeItem(e218: string) {
        this.__selectedTreeItem.set(e218);
    }
    private __previewComponentId: ObservedPropertySimplePU<string>;
    get previewComponentId() {
        return this.__previewComponentId.get();
    }
    set previewComponentId(d218: string) {
        this.__previewComponentId.set(d218);
    }
    private __toolMode: ObservedPropertySimplePU<EditorToolMode>;
    get toolMode() {
        return this.__toolMode.get();
    }
    set toolMode(c218: EditorToolMode) {
        this.__toolMode.set(c218);
    }
    private __showOpenDialog: ObservedPropertySimplePU<boolean>;
    get showOpenDialog() {
        return this.__showOpenDialog.get();
    }
    set showOpenDialog(b218: boolean) {
        this.__showOpenDialog.set(b218);
    }
    private __openFilePath: ObservedPropertySimplePU<string>;
    get openFilePath() {
        return this.__openFilePath.get();
    }
    set openFilePath(a218: string) {
        this.__openFilePath.set(a218);
    }
    private __showSaveAsDialog: ObservedPropertySimplePU<boolean>;
    get showSaveAsDialog() {
        return this.__showSaveAsDialog.get();
    }
    set showSaveAsDialog(z217: boolean) {
        this.__showSaveAsDialog.set(z217);
    }
    private __saveAsPath: ObservedPropertySimplePU<string>;
    get saveAsPath() {
        return this.__saveAsPath.get();
    }
    set saveAsPath(y217: string) {
        this.__saveAsPath.set(y217);
    }
    private __showBurnDialog: ObservedPropertySimplePU<boolean>;
    get showBurnDialog() {
        return this.__showBurnDialog.get();
    }
    set showBurnDialog(x217: boolean) {
        this.__showBurnDialog.set(x217);
    }
    private __burnFilePath: ObservedPropertySimplePU<string>;
    get burnFilePath() {
        return this.__burnFilePath.get();
    }
    set burnFilePath(w217: string) {
        this.__burnFilePath.set(w217);
    }
    private __burnMcuFamily: ObservedPropertySimplePU<string>;
    get burnMcuFamily() {
        return this.__burnMcuFamily.get();
    }
    set burnMcuFamily(v217: string) {
        this.__burnMcuFamily.set(v217);
    }
    private __burnFirmwareInfo: ObservedPropertySimplePU<string>;
    get burnFirmwareInfo() {
        return this.__burnFirmwareInfo.get();
    }
    set burnFirmwareInfo(u217: string) {
        this.__burnFirmwareInfo.set(u217);
    }
    private __burnSegmentInfo: ObservedPropertySimplePU<string>;
    get burnSegmentInfo() {
        return this.__burnSegmentInfo.get();
    }
    set burnSegmentInfo(t217: string) {
        this.__burnSegmentInfo.set(t217);
    }
    private __burnEntryPoint: ObservedPropertySimplePU<string>;
    get burnEntryPoint() {
        return this.__burnEntryPoint.get();
    }
    set burnEntryPoint(s217: string) {
        this.__burnEntryPoint.set(s217);
    }
    private __burnFileSize: ObservedPropertySimplePU<string>;
    get burnFileSize() {
        return this.__burnFileSize.get();
    }
    set burnFileSize(r217: string) {
        this.__burnFileSize.set(r217);
    }
    private __wireStartActive: ObservedPropertySimplePU<boolean>;
    get wireStartActive() {
        return this.__wireStartActive.get();
    }
    set wireStartActive(q217: boolean) {
        this.__wireStartActive.set(q217);
    }
    private __wireStartX: ObservedPropertySimplePU<number>;
    get wireStartX() {
        return this.__wireStartX.get();
    }
    set wireStartX(p217: number) {
        this.__wireStartX.set(p217);
    }
    private __wireStartY: ObservedPropertySimplePU<number>;
    get wireStartY() {
        return this.__wireStartY.get();
    }
    set wireStartY(o217: number) {
        this.__wireStartY.set(o217);
    }
    private __navRefreshKey: ObservedPropertySimplePU<number>;
    get navRefreshKey() {
        return this.__navRefreshKey.get();
    }
    set navRefreshKey(n217: number) {
        this.__navRefreshKey.set(n217);
    }
    private __showWelcomeDialog: ObservedPropertySimplePU<boolean>;
    get showWelcomeDialog() {
        return this.__showWelcomeDialog.get();
    }
    set showWelcomeDialog(m217: boolean) {
        this.__showWelcomeDialog.set(m217);
    }
    private __showNewProjectDialog: ObservedPropertySimplePU<boolean>;
    get showNewProjectDialog() {
        return this.__showNewProjectDialog.get();
    }
    set showNewProjectDialog(l217: boolean) {
        this.__showNewProjectDialog.set(l217);
    }
    private __newProjectNameInput: ObservedPropertySimplePU<string>;
    get newProjectNameInput() {
        return this.__newProjectNameInput.get();
    }
    set newProjectNameInput(k217: string) {
        this.__newProjectNameInput.set(k217);
    }
    private __showRecoveryDialog: ObservedPropertySimplePU<boolean>;
    get showRecoveryDialog() {
        return this.__showRecoveryDialog.get();
    }
    set showRecoveryDialog(j217: boolean) {
        this.__showRecoveryDialog.set(j217);
    }
    private __recoveryFiles: ObservedPropertyObjectPU<string[]>;
    get recoveryFiles() {
        return this.__recoveryFiles.get();
    }
    set recoveryFiles(i217: string[]) {
        this.__recoveryFiles.set(i217);
    }
    private __appInitialized: ObservedPropertySimplePU<boolean>;
    get appInitialized() {
        return this.__appInitialized.get();
    }
    set appInitialized(h217: boolean) {
        this.__appInitialized.set(h217);
    }
    private __unsavedChanges: ObservedPropertySimplePU<boolean>;
    get unsavedChanges() {
        return this.__unsavedChanges.get();
    }
    set unsavedChanges(g217: boolean) {
        this.__unsavedChanges.set(g217);
    }
    private __showExitConfirmDialog: ObservedPropertySimplePU<boolean>;
    get showExitConfirmDialog() {
        return this.__showExitConfirmDialog.get();
    }
    set showExitConfirmDialog(f217: boolean) {
        this.__showExitConfirmDialog.set(f217);
    }
    private clipboardLibId: string;
    private clipboardDeviceIds: string[];
    private userProjectDir: string;
    private modifierKeys: number;
    private appService: AppService;
    private vm: AppViewModel;
    private uiState: UiStateStore;
    async aboutToAppear(): Promise<void> {
        const u216 = this.getUIContext().getHostContext() as common.UIAbilityContext;
        this.appService.initPlatform(u216);
        this.userProjectDir = this.appService.getUserProjectDir();
        this.vm.bindCallbacks();
        this.appService.onStatusMessage = (e217: string) => { this.statusMessage = e217; };
        this.appService.onErcUpdate = (d217: ErcError[]) => {
            this.ercCount = d217.length;
            this.ercErrors = d217;
        };
        this.appService.onAiProgress = (c217: ProgressInfo) => {
            this.aiProgress = c217.progress;
            this.aiStage = c217.stage;
        };
        this.appService.onProjectChanged = () => {
            this.projectName = this.appService.currentProject?.name ?? 'Untitled';
            this.canvasVersion++;
        };
        this.appService.onWaveUpdate = (b217) => {
            this.simWaveTick++;
        };
        CallbackRegistry.getInstance().onSelectionChange((z216) => {
            this.selectedCount = z216.length;
            const a217 = this.appService.schematicEditor.getSelectedNets();
            this.selectedWireActive = a217.length > 0;
            if (z216.length > 0) {
                this.selectedComponentId = z216[0].instUuid;
                this.updateContextualTabs(z216[0].instUuid);
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
        void maximizeAppWindow(u216);
        this.recoveryFiles = await this.appService.checkRecoveryFiles();
        if (this.recoveryFiles.length > 0) {
            this.appService.newProject('Untitled');
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/Untitled.schsim`, 120000);
            this.showRecoveryDialog = true;
            this.appInitialized = true;
            this.statusMessage = '检测到未正常关闭的工程，是否恢复？';
            return;
        }
        const v216 = await this.appService.loadSession();
        if (v216 !== null && v216.lastPath.length > 0) {
            const w216 = `${this.appService.getAutosaveDir()}/${v216.lastProjectName}.schsim`;
            if (v216.closedCleanly) {
                let y216 = await this.appService.loadProject(v216.lastPath);
                if (!y216 && v216.lastPath !== w216) {
                    y216 = await this.appService.loadProject(w216);
                }
                if (y216) {
                    this.projectName = this.appService.currentProject?.name ?? v216.lastProjectName;
                    this.appService.enableAutoSave(w216, 120000);
                    this.resetAfterProjectChange();
                    this.refreshComponentList();
                    this.deferCanvasFit();
                    this.appInitialized = true;
                    this.statusMessage = `已恢复上次工程: ${this.projectName}`;
                    return;
                }
            }
            else {
                const x216 = await this.appService.loadProject(w216);
                if (x216) {
                    this.projectName = this.appService.currentProject?.name ?? v216.lastProjectName;
                    this.appService.enableAutoSave(w216, 120000);
                    this.resetAfterProjectChange();
                    this.refreshComponentList();
                    this.deferCanvasFit();
                    this.appInitialized = true;
                    this.statusMessage = `已从自动保存恢复: ${this.projectName}`;
                    return;
                }
            }
        }
        this.appService.newProject('Untitled');
        this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/Untitled.schsim`, 120000);
        this.refreshComponentList();
        this.deferCanvasFit();
        this.appInitialized = true;
        this.showWelcomeDialog = true;
        this.statusMessage = '欢迎使用 AI 原理图仿真 — 请新建或打开工程';
    }
    onPageHide(): void {
        void this.appService.saveRecoveryCache();
    }
    aboutToDisappear(): void {
        void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, !this.unsavedChanges);
    }
    onBackPress(): boolean {
        if (this.unsavedChanges) {
            this.showExitConfirmDialog = true;
            return true;
        }
        void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
        return false;
    }
    loadUiState(): void {
        const t216 = this.uiState;
        this.leftLibCollapsed = t216.leftLibCollapsed;
        this.leftNavCollapsed = t216.leftNavCollapsed;
        this.rightCollapsed = t216.rightCollapsed;
        this.activeRightTab = t216.activeRightTab;
        this.leftPanelWidth = t216.leftPanelWidth;
        this.rightPanelWidth = t216.rightPanelWidth;
        this.gridVisible = t216.gridVisible;
        this.rulerVisible = t216.rulerVisible;
        this.toolMode = t216.toolMode;
        this.expandedCategories = t216.getExpandedCategories();
    }
    persistUiState(): void {
        const s216 = this.uiState;
        s216.leftLibCollapsed = this.leftLibCollapsed;
        s216.leftNavCollapsed = this.leftNavCollapsed;
        s216.rightCollapsed = this.rightCollapsed;
        s216.activeRightTab = this.activeRightTab;
        s216.leftPanelWidth = this.leftPanelWidth;
        s216.rightPanelWidth = this.rightPanelWidth;
        s216.gridVisible = this.gridVisible;
        s216.rulerVisible = this.rulerVisible;
        s216.toolMode = this.toolMode;
        s216.setExpandedCategories(this.expandedCategories);
    }
    updateContextualTabs(l216: string): void {
        const m216 = this.appService.schematicEditor.getDocument();
        const n216 = m216.components.find(r216 => r216.id === l216);
        if (!n216)
            return;
        const o216 = n216.libraryId.toUpperCase();
        const p216 = o216.startsWith('STM32') || o216.startsWith('8051') || o216.startsWith('AT89') || o216.startsWith('AVR');
        const q216 = isInstrumentLibraryId(n216.libraryId);
        this.debugTabHasBadge = p216;
        this.instrTabHasBadge = q216;
        if (p216) {
            this.activeRightTab = 3;
        }
        else if (q216) {
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
        const f216 = this.appService.componentLibrary.getCategories();
        const g216: Map<ComponentCategory, string> = new Map([
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
        const h216: CategoryNode[] = [];
        const i216 = new Set<ComponentCategory>();
        for (let j216 = 0; j216 < f216.length; j216++) {
            const k216 = f216[j216];
            h216.push({ cat: k216, label: g216.get(k216) ?? k216, expanded: false });
            if (j216 === 0) {
                i216.add(k216);
            }
        }
        this.categoryNodes = h216;
        this.expandedCategories = i216;
    }
    toggleCategory(d216: ComponentCategory): void {
        const e216 = new Set(this.expandedCategories);
        if (e216.has(d216)) {
            e216.delete(d216);
        }
        else {
            e216.add(d216);
        }
        this.expandedCategories = e216;
    }
    refreshComponentList(): void {
        const a216 = this.searchKeyword.trim();
        if (a216.length > 0) {
            const b216 = this.appService.componentLibrary.search(a216, 1, 50);
            this.componentList = b216.items.map(c216 => `${c216.id}|${c216.name}`);
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
    private deferCanvasFit(y215: number = 0): void {
        const z215 = this.appService.schematicEditor as SchematicEditorImpl;
        if (z215.isCanvasViewReady()) {
            z215.fitAllInView();
            this.bumpCanvas();
            return;
        }
        if (y215 < 30) {
            setTimeout(() => this.deferCanvasFit(y215 + 1), 50);
        }
    }
    private hookStartupWindowResize(): void {
        if (this.windowResizeHooked) {
            return;
        }
        this.windowResizeHooked = true;
        this.startupRefitDeadline = Date.now() + 4000;
        const w215 = this.getUIContext().getHostContext() as common.UIAbilityContext;
        window.getLastWindow(w215).then((x215) => {
            x215.on('windowSizeChange', () => {
                if (Date.now() > this.startupRefitDeadline) {
                    return;
                }
                this.deferCanvasFit();
            });
        }).catch(() => { });
    }
    onPageShow(): void {
        const v215 = this.getUIContext().getHostContext() as common.UIAbilityContext;
        void maximizeAppWindow(v215);
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
    private applySimStartResult(u215: boolean): void {
        this.simRunning = u215;
        if (u215) {
            this.lockEditingForSimulation();
        }
    }
    setToolMode(s215: EditorToolMode, t215: string = ''): void {
        if (this.simRunning && (s215 === EditorToolMode.WIRE || s215 === EditorToolMode.BUS)) {
            this.statusMessage = '仿真运行中，无法接线';
            return;
        }
        this.toolMode = s215;
        this.wireStartActive = false;
        this.wireStartX = 0;
        this.wireStartY = 0;
        if (t215.length > 0) {
            this.previewComponentId = t215;
        }
        else if (s215 === EditorToolMode.PLACE && this.previewComponentId.length === 0 &&
            this.selectedTreeItem.length > 0) {
            this.previewComponentId = this.selectedTreeItem.split('|')[0];
        }
        if (s215 === EditorToolMode.PLACE) {
            if (this.previewComponentId.length > 0) {
                this.statusMessage = `Placing: ${this.previewComponentId}`;
            }
            else {
                this.statusMessage = 'Click on canvas to place component';
            }
        }
        else {
            this.statusMessage = `Mode: ${toolModeLabel(s215)}`;
        }
        this.uiState.toolMode = s215;
        this.bumpCanvas();
    }
    selectLibraryItem(r215: string): void {
        this.selectedTreeItem = r215;
        this.previewComponentId = r215.split('|')[0];
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
        const n215 = this.newProjectNameInput.trim().length > 0 ? this.newProjectNameInput.trim() : 'Untitled';
        this.showNewProjectDialog = false;
        this.showWelcomeDialog = false;
        this.appService.disableAutoSave();
        this.appService.newProject(n215);
        this.projectName = n215;
        this.resetAfterProjectChange();
        this.refreshComponentList();
        this.appService.schematicEditor.fitAllInView();
        const o215 = `${this.userProjectDir}/${n215}.schsim`;
        const p215 = `${this.appService.getAutosaveDir()}/${n215}.schsim`;
        void this.appService.saveProject(o215).then((q215) => {
            if (q215) {
                this.appService.currentProjectPath = o215;
                this.statusMessage = `已创建: ${o215}`;
            }
        });
        this.appService.enableAutoSave(p215, 120000);
        this.appService.currentProjectPath = o215;
    }
    async handleOpenProject(): Promise<void> {
        this.showWelcomeDialog = false;
        const l215 = this.appService.listUserProjectFiles();
        const m215 = this.appService.filePersistence.getRecentFiles();
        if (l215.length > 0) {
            this.openFilePath = l215[l215.length - 1];
        }
        else if (m215.length > 0) {
            this.openFilePath = m215[0];
        }
        else {
            this.openFilePath = `${this.userProjectDir}/Untitled.schsim`;
        }
        this.showOpenDialog = true;
        this.showSaveAsDialog = false;
    }
    async handleOpenFromPicker(): Promise<void> {
        try {
            const g215 = new picker.DocumentSelectOptions();
            g215.maxSelectNumber = 1;
            g215.fileSuffixFilters = ['.schsim', '.json'];
            const h215 = new picker.DocumentViewPicker();
            const i215 = await h215.select(g215);
            if (i215 && i215.length > 0) {
                const j215 = await this.appService.loadProject(i215[0]);
                if (j215) {
                    this.projectName = this.appService.currentProject?.name ?? this.projectName;
                    const k215 = this.projectName;
                    this.appService.disableAutoSave();
                    this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${k215}.schsim`, 120000);
                    this.resetAfterProjectChange();
                    this.appService.schematicEditor.fitAllInView();
                    this.refreshComponentList();
                    await this.appService.saveSession(i215[0], k215, false);
                    this.statusMessage = `已加载: ${i215[0]}`;
                    return;
                }
            }
        }
        catch (f215) {
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
        const c215 = this.openFilePath.trim();
        const d215 = await this.appService.loadProject(c215);
        if (d215) {
            this.projectName = this.appService.currentProject?.name ?? this.projectName;
            const e215 = this.projectName;
            this.appService.disableAutoSave();
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${e215}.schsim`, 120000);
            this.resetAfterProjectChange();
            this.appService.schematicEditor.fitAllInView();
            this.refreshComponentList();
            await this.appService.saveSession(c215, e215, false);
            this.statusMessage = `已加载: ${c215}`;
        }
        else {
            this.statusMessage = `无法打开: ${c215}`;
        }
    }
    async handleSaveProject(): Promise<void> {
        const z214 = this.appService.currentProjectPath;
        if (z214.length > 0) {
            const a215 = await this.appService.saveProject(z214);
            if (a215) {
                const b215 = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
                void this.appService.saveProject(b215);
                await this.appService.saveSession(z214, this.projectName, false);
                this.unsavedChanges = false;
            }
            this.statusMessage = a215 ? `已保存: ${z214}` : '保存失败';
            return;
        }
        await this.handleSaveAs();
    }
    async handleSaveAs(): Promise<void> {
        try {
            const u214 = new picker.DocumentSaveOptions();
            u214.newFileNames = [`${this.projectName}.schsim`];
            u214.fileSuffixChoices = ['schsim', 'json'];
            const v214 = new picker.DocumentViewPicker();
            const w214 = await v214.save(u214);
            if (w214 && w214.length > 0) {
                const x214 = await this.appService.saveProject(w214[0]);
                if (x214) {
                    const y214 = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
                    void this.appService.saveProject(y214);
                    await this.appService.saveSession(w214[0], this.projectName, false);
                    this.unsavedChanges = false;
                }
                this.statusMessage = x214 ? `已保存: ${w214[0]}` : '保存失败';
                return;
            }
        }
        catch (t214) {
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
        const r214 = this.saveAsPath.trim();
        const s214 = await this.appService.saveProject(r214);
        if (s214) {
            await this.appService.saveSession(r214, this.projectName, false);
            this.unsavedChanges = false;
        }
        this.statusMessage = s214 ? `已保存: ${r214}` : '保存失败';
    }
    async doBurnHex(): Promise<void> {
        const g214 = this.burnFilePath.trim();
        if (g214.length === 0) {
            this.statusMessage = '请选择或输入 HEX 文件路径';
            return;
        }
        try {
            const i214 = fs.openSync(g214, fs.OpenMode.READ_ONLY);
            const j214 = fs.statSync(g214);
            const k214 = new ArrayBuffer(j214.size);
            fs.readSync(i214.fd, k214);
            fs.closeSync(i214);
            const l214 = new Uint8Array(k214);
            const m214 = this.burnMcuFamily === '8051' ? McuFamily.MCU_8051 : McuFamily.MCU_STM32F1;
            const n214 = this.appService.hexDebugger.loadHexData(l214, m214);
            if (n214.success) {
                this.appService.simulationKernel.loadMcuProgram(new Uint8Array(k214), 0, this.burnMcuFamily);
                const o214 = this.appService.hexDebugger.getParsedHexInfo();
                if (o214) {
                    this.burnFileSize = `${(j214.size / 1024).toFixed(1)} KB`;
                    const p214 = o214.flashSegments.length;
                    this.burnSegmentInfo = `${p214} 段`;
                    const q214 = o214.minAddr;
                    this.burnEntryPoint = `0x${q214.toString(16).toUpperCase().padStart(4, '0')}`;
                    this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}, ${this.burnSegmentInfo}, 入口 ${this.burnEntryPoint}`;
                }
                else {
                    this.burnFileSize = `${(j214.size / 1024).toFixed(1)} KB`;
                    this.burnFirmwareInfo = `已烧录 ${this.burnFileSize}`;
                    this.burnSegmentInfo = '--';
                    this.burnEntryPoint = '0x0000';
                }
                this.statusMessage = `HEX 烧录成功: ${g214}`;
                this.rightCollapsed = false;
                this.uiState.rightCollapsed = false;
                this.setActiveRightTab(3);
            }
            else {
                this.statusMessage = `HEX 加载失败: ${n214.error ?? '未知错误'}`;
                this.burnFirmwareInfo = '';
            }
        }
        catch (h214) {
            this.statusMessage = `烧录失败: ${h214}`;
            this.burnFirmwareInfo = '';
        }
    }
    async doBrowseHexFile(): Promise<void> {
        try {
            const d214 = new picker.DocumentSelectOptions();
            d214.maxSelectNumber = 1;
            d214.fileSuffixFilters = ['.hex', '.HEX', '.bin', '.BIN'];
            const e214 = new picker.DocumentViewPicker();
            const f214 = await e214.select(d214);
            if (f214 && f214.length > 0) {
                this.burnFilePath = f214[0];
            }
        }
        catch (c214) {
            this.statusMessage = '文件选择器不可用，请手动输入路径';
        }
    }
    handleDeleteSelected(): void {
        const y213 = this.appService.schematicEditor.getSelectedDevices();
        const z213 = this.appService.schematicEditor.getSelectedNets();
        if (y213.length > 0) {
            const a214: string[] = [];
            for (let b214 = 0; b214 < y213.length; b214++) {
                a214.push(y213[b214].instUuid);
            }
            this.appService.schematicEditor.batchDeleteDevice(a214);
        }
        if (z213.length > 0) {
            this.appService.schematicEditor.clearSelectedRoute();
        }
        if (y213.length === 0 && z213.length === 0) {
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
        const w213 = this.appService.schematicEditor.getSelectedDevices();
        if (w213.length === 0) {
            this.statusMessage = '请先选中器件';
            return;
        }
        this.clipboardDeviceIds = [];
        for (let x213 = 0; x213 < w213.length; x213++) {
            this.clipboardDeviceIds.push(w213[x213].instUuid);
        }
        this.clipboardLibId = w213[0].libDevId;
        this.statusMessage = w213.length > 1
            ? `已复制 ${w213.length} 个器件`
            : `已复制 ${w213[0].refName}`;
    }
    handlePaste(): void {
        if (this.clipboardDeviceIds.length > 0) {
            const s213: string[] = [];
            for (let t213 = 0; t213 < this.clipboardDeviceIds.length; t213++) {
                const u213 = 30 + t213 * 12;
                const v213 = this.appService.schematicEditor.duplicateDevice(this.clipboardDeviceIds[t213], u213, u213);
                if (v213.success && v213.data) {
                    s213.push(v213.data);
                }
            }
            if (s213.length > 0) {
                this.appService.schematicEditor.setSelection(s213);
                this.selectedComponentId = s213[s213.length - 1];
                this.bumpCanvas();
                this.statusMessage = s213.length > 1 ? `已粘贴 ${s213.length} 个器件` : '已粘贴';
            }
            return;
        }
        if (this.clipboardLibId.length === 0) {
            this.statusMessage = 'Clipboard empty';
            return;
        }
        const p213 = 200 + (this.navRefreshKey % 5) * 30;
        const q213 = 150 + (this.navRefreshKey % 5) * 30;
        const r213 = this.appService.schematicEditor.placeComponent(this.clipboardLibId, { x: p213, y: q213 });
        if (r213.success && r213.data) {
            this.selectedComponentId = r213.data.id;
            this.bumpCanvas();
            this.statusMessage = `Placed ${this.clipboardLibId}`;
        }
    }
    handleAlign(l213: AlignType): void {
        const m213 = this.appService.schematicEditor.getSelectedDevices();
        if (m213.length < 2) {
            this.statusMessage = 'Select at least 2 components';
            return;
        }
        const n213 = m213.map(o213 => o213.instUuid);
        this.appService.schematicEditor.batchAlign(n213, l213);
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
        const h213 = this.appService.schematicEditor.getDocument();
        const i213 = h213.components.find(k213 => k213.id === this.selectedComponentId);
        if (i213) {
            const j213 = ((i213.rotation + 90) % 360) as 0 | 90 | 180 | 270;
            this.appService.schematicEditor.rotateComponent(i213.id, j213);
            this.bumpCanvas();
        }
    }
    placeComponent(c213: string): void {
        const d213 = this.appService.componentLibrary.resolveLibraryId(c213);
        const e213 = 150 + (this.navRefreshKey % 8) * 40;
        const f213 = 100 + (this.navRefreshKey % 6) * 40;
        const g213 = this.appService.schematicEditor.placeComponent(d213, { x: e213, y: f213 });
        if (g213.success && g213.data) {
            this.selectedComponentId = g213.data.id;
            this.bumpCanvas();
            this.statusMessage = `Placed ${d213}`;
        }
        else {
            this.statusMessage = `Failed: ${g213.error ?? d213}`;
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
    onLeftPanelResize(b213: number): void {
        this.leftPanelWidth = Math.min(400, Math.max(160, this.leftPanelWidth + b213));
        this.uiState.leftPanelWidth = this.leftPanelWidth;
    }
    onRightPanelResize(a213: number): void {
        this.rightPanelWidth = Math.min(420, Math.max(200, this.rightPanelWidth + a213));
        this.uiState.rightPanelWidth = this.rightPanelWidth;
    }
    setActiveRightTab(z212: number): void {
        this.activeRightTab = z212;
        this.uiState.activeRightTab = z212;
    }
    private onSchematicChanged;
    initialRender() {
        this.observeComponentCreation2((x212, y212) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((u212, v212) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.MENU_BG);
            Column.onKeyEvent((w212: KeyEvent) => this.handleKeyEvent(w212));
        }, Column);
        this.MenuBar.bind(this)();
        this.MainToolbar.bind(this)();
        this.observeComponentCreation2((s212, t212) => {
            Row.create();
            Row.layoutWeight(1);
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((q212, r212) => {
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
        this.observeComponentCreation2((i212, j212) => {
            If.create();
            if (!this.leftLibCollapsed || !this.leftNavCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((k212, l212) => {
                            if (l212) {
                                let m212 = new ProteusResizer(this, { side: 'left', onDrag: (p212: number) => this.onLeftPanelResize(p212) }, undefined, k212, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 851, col: 13 });
                                ViewPU.create(m212);
                                let n212 = () => {
                                    return {
                                        side: 'left',
                                        onDrag: (o212: number) => this.onLeftPanelResize(o212)
                                    };
                                };
                                m212.paramsGenerator_ = n212;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(k212, {
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
        this.observeComponentCreation2((a212, b212) => {
            If.create();
            if (!this.rightCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((c212, d212) => {
                            if (d212) {
                                let e212 = new ProteusResizer(this, { side: 'right', onDrag: (h212: number) => this.onRightPanelResize(h212) }, undefined, c212, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 855, col: 13 });
                                ViewPU.create(e212);
                                let f212 = () => {
                                    return {
                                        side: 'right',
                                        onDrag: (g212: number) => this.onRightPanelResize(g212)
                                    };
                                };
                                e212.paramsGenerator_ = f212;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(c212, {
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
        this.observeComponentCreation2((y211, z211) => {
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
        this.observeComponentCreation2((w211, x211) => {
            If.create();
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
        this.observeComponentCreation2((u211, v211) => {
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
        this.observeComponentCreation2((s211, t211) => {
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
        this.observeComponentCreation2((q211, r211) => {
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
        this.observeComponentCreation2((o211, p211) => {
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
        this.observeComponentCreation2((m211, n211) => {
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
        this.observeComponentCreation2((k211, l211) => {
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
    handleKeyEvent(g211: KeyEvent): boolean {
        if (g211.type === KeyType.Down) {
            if (g211.keyCode === 2021 || g211.keyCode === 2022) {
                this.modifierKeys |= 1;
                return false;
            }
        }
        if (g211.type === KeyType.Up) {
            if (g211.keyCode === 2021 || g211.keyCode === 2022) {
                this.modifierKeys &= ~1;
                return false;
            }
        }
        if (g211.type !== KeyType.Down)
            return false;
        const h211 = (this.modifierKeys & 1) !== 0;
        const i211 = (g211.keyText ?? '').toLowerCase();
        if (h211) {
            switch (i211) {
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
        if (i211 === 'escape' || g211.keyCode === 27) {
            this.setToolMode(EditorToolMode.SELECT);
            return true;
        }
        if (i211 === 'delete' || g211.keyCode === 46 || g211.keyCode === 8) {
            this.handleDeleteSelected();
            return true;
        }
        if (i211 === 'f1') {
            this.setActiveRightTab(7);
            this.rightCollapsed = false;
            this.uiState.rightCollapsed = false;
            return true;
        }
        if (i211 === 'f5') {
            if (this.simRunning) {
                this.appService.stopSimulation();
                this.simRunning = false;
            }
            else {
                this.applySimStartResult(this.appService.startSimulation());
            }
            return true;
        }
        if (i211 === 'f7') {
            const j211 = this.appService.runErc(false);
            this.ercErrors = j211;
            this.ercCount = j211.length;
            this.navTab = 3;
            this.statusMessage = `ERC: ${j211.length} issues`;
            return true;
        }
        switch (i211) {
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
    MenuBar(t209 = null) {
        this.observeComponentCreation2((e211, f211) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.MENU_HEIGHT);
            Row.backgroundColor(ProteusColors.MENU_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        {
            this.observeComponentCreation2((a211, b211) => {
                if (b211) {
                    let c211 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886094, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.fileMenuEntries()
                    }, undefined, a211, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 970, col: 7 });
                    ViewPU.create(c211);
                    let d211 = () => {
                        return {
                            label: { "id": 83886094, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.fileMenuEntries()
                        };
                    };
                    c211.paramsGenerator_ = d211;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(a211, {
                        label: { "id": 83886094, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((w210, x210) => {
                if (x210) {
                    let y210 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886093, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.editMenuEntries()
                    }, undefined, w210, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 974, col: 7 });
                    ViewPU.create(y210);
                    let z210 = () => {
                        return {
                            label: { "id": 83886093, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.editMenuEntries()
                        };
                    };
                    y210.paramsGenerator_ = z210;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w210, {
                        label: { "id": 83886093, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((s210, t210) => {
                if (t210) {
                    let u210 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886100, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.viewMenuEntries()
                    }, undefined, s210, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 978, col: 7 });
                    ViewPU.create(u210);
                    let v210 = () => {
                        return {
                            label: { "id": 83886100, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.viewMenuEntries()
                        };
                    };
                    u210.paramsGenerator_ = v210;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(s210, {
                        label: { "id": 83886100, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((o210, p210) => {
                if (p210) {
                    let q210 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886097, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.placeMenuEntries()
                    }, undefined, o210, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 982, col: 7 });
                    ViewPU.create(q210);
                    let r210 = () => {
                        return {
                            label: { "id": 83886097, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.placeMenuEntries()
                        };
                    };
                    q210.paramsGenerator_ = r210;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(o210, {
                        label: { "id": 83886097, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((k210, l210) => {
                if (l210) {
                    let m210 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886099, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.simMenuEntries()
                    }, undefined, k210, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 986, col: 7 });
                    ViewPU.create(m210);
                    let n210 = () => {
                        return {
                            label: { "id": 83886099, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.simMenuEntries()
                        };
                    };
                    m210.paramsGenerator_ = n210;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(k210, {
                        label: { "id": 83886099, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((g210, h210) => {
                if (h210) {
                    let i210 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886096, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.libraryMenuEntries()
                    }, undefined, g210, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 990, col: 7 });
                    ViewPU.create(i210);
                    let j210 = () => {
                        return {
                            label: { "id": 83886096, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.libraryMenuEntries()
                        };
                    };
                    i210.paramsGenerator_ = j210;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g210, {
                        label: { "id": 83886096, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((c210, d210) => {
                if (d210) {
                    let e210 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886098, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.projectMenuEntries()
                    }, undefined, c210, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 994, col: 7 });
                    ViewPU.create(e210);
                    let f210 = () => {
                        return {
                            label: { "id": 83886098, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.projectMenuEntries()
                        };
                    };
                    e210.paramsGenerator_ = f210;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(c210, {
                        label: { "id": 83886098, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        {
            this.observeComponentCreation2((y209, z209) => {
                if (z209) {
                    let a210 = new ProteusMenuTrigger(this, {
                        label: { "id": 83886095, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.helpMenuEntries()
                    }, undefined, y209, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 998, col: 7 });
                    ViewPU.create(a210);
                    let b210 = () => {
                        return {
                            label: { "id": 83886095, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            entries: this.helpMenuEntries()
                        };
                    };
                    a210.paramsGenerator_ = b210;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(y209, {
                        label: { "id": 83886095, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }
                    });
                }
            }, { name: "ProteusMenuTrigger" });
        }
        this.observeComponentCreation2((w209, x209) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((u209, v209) => {
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
                    const s209 = this.appService.schematicEditor.undo();
                    this.statusMessage = s209.success ? 'Undone' : 'Nothing to undo';
                    this.bumpCanvas();
                } },
            { label: { "id": 83886159, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+Y', icon: ProteusIconName.REDO, action: () => {
                    const r209 = this.appService.schematicEditor.redo();
                    this.statusMessage = r209.success ? 'Redone' : 'Nothing to redo';
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
                    const o209 = this.appService.runErc(false);
                    this.ercErrors = o209;
                    const p209 = o209.filter(q209 => q209.severity === 'error' || q209.severity === 'critical').length;
                    this.ercCount = o209.length;
                    this.navTab = 3;
                    this.statusMessage = `ERC: ${o209.length} issues (${p209} errors)`;
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
    MainToolbar(b197 = null) {
        this.observeComponentCreation2((m209, n209) => {
            Row.create();
            Row.padding({ left: 4, right: 4 });
            Row.alignItems(VerticalAlign.Center);
            Row.width('100%');
            Row.height(ProteusDimens.TOOLBAR_HEIGHT);
            Row.backgroundColor(ProteusColors.TOOLBAR_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
        }, Row);
        {
            this.observeComponentCreation2((k208, l208) => {
                if (l208) {
                    let m208 = new ProteusToolGroup(this, {
                        title: 'File',
                        content: () => {
                            {
                                this.observeComponentCreation2((i209, j209) => {
                                    if (j209) {
                                        let k209 = new ProteusToolButton(this, { iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } }, undefined, i209, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1149, col: 9 });
                                        ViewPU.create(k209);
                                        let l209 = () => {
                                            return {
                                                iconName: ProteusIconName.NEW,
                                                tooltip: '新建文件 (Ctrl+N)',
                                                showLabel: false,
                                                onAction: () => { void this.handleNewProject(); }
                                            };
                                        };
                                        k209.paramsGenerator_ = l209;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(i209, {
                                            iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((e209, f209) => {
                                    if (f209) {
                                        let g209 = new ProteusToolButton(this, { iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } }, undefined, e209, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1150, col: 9 });
                                        ViewPU.create(g209);
                                        let h209 = () => {
                                            return {
                                                iconName: ProteusIconName.OPEN,
                                                tooltip: '打开文件 (Ctrl+O)',
                                                showLabel: false,
                                                onAction: () => { void this.handleOpenProject(); }
                                            };
                                        };
                                        g209.paramsGenerator_ = h209;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(e209, {
                                            iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((a209, b209) => {
                                    if (b209) {
                                        let c209 = new ProteusToolButton(this, { iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } }, undefined, a209, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1151, col: 9 });
                                        ViewPU.create(c209);
                                        let d209 = () => {
                                            return {
                                                iconName: ProteusIconName.SAVE,
                                                tooltip: '保存文件 (Ctrl+S)',
                                                showLabel: false,
                                                onAction: () => { void this.handleSaveProject(); }
                                            };
                                        };
                                        c209.paramsGenerator_ = d209;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(a209, {
                                            iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, k208, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1148, col: 7 });
                    ViewPU.create(m208);
                    let n208 = () => {
                        return {
                            title: 'File',
                            content: () => {
                                {
                                    this.observeComponentCreation2((w208, x208) => {
                                        if (x208) {
                                            let y208 = new ProteusToolButton(this, { iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } }, undefined, w208, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1149, col: 9 });
                                            ViewPU.create(y208);
                                            let z208 = () => {
                                                return {
                                                    iconName: ProteusIconName.NEW,
                                                    tooltip: '新建文件 (Ctrl+N)',
                                                    showLabel: false,
                                                    onAction: () => { void this.handleNewProject(); }
                                                };
                                            };
                                            y208.paramsGenerator_ = z208;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(w208, {
                                                iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((s208, t208) => {
                                        if (t208) {
                                            let u208 = new ProteusToolButton(this, { iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } }, undefined, s208, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1150, col: 9 });
                                            ViewPU.create(u208);
                                            let v208 = () => {
                                                return {
                                                    iconName: ProteusIconName.OPEN,
                                                    tooltip: '打开文件 (Ctrl+O)',
                                                    showLabel: false,
                                                    onAction: () => { void this.handleOpenProject(); }
                                                };
                                            };
                                            u208.paramsGenerator_ = v208;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(s208, {
                                                iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((o208, p208) => {
                                        if (p208) {
                                            let q208 = new ProteusToolButton(this, { iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } }, undefined, o208, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1151, col: 9 });
                                            ViewPU.create(q208);
                                            let r208 = () => {
                                                return {
                                                    iconName: ProteusIconName.SAVE,
                                                    tooltip: '保存文件 (Ctrl+S)',
                                                    showLabel: false,
                                                    onAction: () => { void this.handleSaveProject(); }
                                                };
                                            };
                                            q208.paramsGenerator_ = r208;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(o208, {
                                                iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    m208.paramsGenerator_ = n208;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(k208, {
                        title: 'File'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((a207, b207) => {
                if (b207) {
                    let c207 = new ProteusToolGroup(this, {
                        title: 'History',
                        content: () => {
                            {
                                this.observeComponentCreation2((e208, f208) => {
                                    if (f208) {
                                        let g208 = new ProteusToolButton(this, { iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false, onAction: () => {
                                                const j208 = this.appService.schematicEditor.undo();
                                                this.statusMessage = j208.success ? 'Undone' : 'Nothing to undo';
                                                this.bumpCanvas();
                                            } }, undefined, e208, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1155, col: 9 });
                                        ViewPU.create(g208);
                                        let h208 = () => {
                                            return {
                                                iconName: ProteusIconName.UNDO,
                                                tooltip: '撤销 (Ctrl+Z)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const i208 = this.appService.schematicEditor.undo();
                                                    this.statusMessage = i208.success ? 'Undone' : 'Nothing to undo';
                                                    this.bumpCanvas();
                                                }
                                            };
                                        };
                                        g208.paramsGenerator_ = h208;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(e208, {
                                            iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((y207, z207) => {
                                    if (z207) {
                                        let a208 = new ProteusToolButton(this, { iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false, onAction: () => {
                                                const d208 = this.appService.schematicEditor.redo();
                                                this.statusMessage = d208.success ? 'Redone' : 'Nothing to redo';
                                                this.bumpCanvas();
                                            } }, undefined, y207, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1160, col: 9 });
                                        ViewPU.create(a208);
                                        let b208 = () => {
                                            return {
                                                iconName: ProteusIconName.REDO,
                                                tooltip: '重做 (Ctrl+Y)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const c208 = this.appService.schematicEditor.redo();
                                                    this.statusMessage = c208.success ? 'Redone' : 'Nothing to redo';
                                                    this.bumpCanvas();
                                                }
                                            };
                                        };
                                        a208.paramsGenerator_ = b208;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(y207, {
                                            iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((u207, v207) => {
                                    if (v207) {
                                        let w207 = new ProteusToolButton(this, { iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                            disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                            onAction: () => this.handleDeleteSelected() }, undefined, u207, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1165, col: 9 });
                                        ViewPU.create(w207);
                                        let x207 = () => {
                                            return {
                                                iconName: ProteusIconName.TRASH,
                                                tooltip: '删除 (Del)',
                                                showLabel: false,
                                                disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                                onAction: () => this.handleDeleteSelected()
                                            };
                                        };
                                        w207.paramsGenerator_ = x207;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(u207, {
                                            iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                            disabled: this.selectedCount === 0 && !this.selectedWireActive
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, a207, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1154, col: 7 });
                    ViewPU.create(c207);
                    let d207 = () => {
                        return {
                            title: 'History',
                            content: () => {
                                {
                                    this.observeComponentCreation2((o207, p207) => {
                                        if (p207) {
                                            let q207 = new ProteusToolButton(this, { iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false, onAction: () => {
                                                    const t207 = this.appService.schematicEditor.undo();
                                                    this.statusMessage = t207.success ? 'Undone' : 'Nothing to undo';
                                                    this.bumpCanvas();
                                                } }, undefined, o207, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1155, col: 9 });
                                            ViewPU.create(q207);
                                            let r207 = () => {
                                                return {
                                                    iconName: ProteusIconName.UNDO,
                                                    tooltip: '撤销 (Ctrl+Z)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const s207 = this.appService.schematicEditor.undo();
                                                        this.statusMessage = s207.success ? 'Undone' : 'Nothing to undo';
                                                        this.bumpCanvas();
                                                    }
                                                };
                                            };
                                            q207.paramsGenerator_ = r207;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(o207, {
                                                iconName: ProteusIconName.UNDO, tooltip: '撤销 (Ctrl+Z)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((i207, j207) => {
                                        if (j207) {
                                            let k207 = new ProteusToolButton(this, { iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false, onAction: () => {
                                                    const n207 = this.appService.schematicEditor.redo();
                                                    this.statusMessage = n207.success ? 'Redone' : 'Nothing to redo';
                                                    this.bumpCanvas();
                                                } }, undefined, i207, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1160, col: 9 });
                                            ViewPU.create(k207);
                                            let l207 = () => {
                                                return {
                                                    iconName: ProteusIconName.REDO,
                                                    tooltip: '重做 (Ctrl+Y)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const m207 = this.appService.schematicEditor.redo();
                                                        this.statusMessage = m207.success ? 'Redone' : 'Nothing to redo';
                                                        this.bumpCanvas();
                                                    }
                                                };
                                            };
                                            k207.paramsGenerator_ = l207;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(i207, {
                                                iconName: ProteusIconName.REDO, tooltip: '重做 (Ctrl+Y)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((e207, f207) => {
                                        if (f207) {
                                            let g207 = new ProteusToolButton(this, { iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                                disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                                onAction: () => this.handleDeleteSelected() }, undefined, e207, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1165, col: 9 });
                                            ViewPU.create(g207);
                                            let h207 = () => {
                                                return {
                                                    iconName: ProteusIconName.TRASH,
                                                    tooltip: '删除 (Del)',
                                                    showLabel: false,
                                                    disabled: this.selectedCount === 0 && !this.selectedWireActive,
                                                    onAction: () => this.handleDeleteSelected()
                                                };
                                            };
                                            g207.paramsGenerator_ = h207;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(e207, {
                                                iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                                                disabled: this.selectedCount === 0 && !this.selectedWireActive
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    c207.paramsGenerator_ = d207;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(a207, {
                        title: 'History'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((g206, h206) => {
                if (h206) {
                    let i206 = new ProteusToolGroup(this, {
                        title: 'Edit',
                        content: () => {
                            {
                                this.observeComponentCreation2((w206, x206) => {
                                    if (x206) {
                                        let y206 = new ProteusToolButton(this, { iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                            disabled: this.selectedCount === 0, onAction: () => this.handleCopy() }, undefined, w206, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1171, col: 9 });
                                        ViewPU.create(y206);
                                        let z206 = () => {
                                            return {
                                                iconName: ProteusIconName.COPY,
                                                tooltip: '复制 (Ctrl+C)',
                                                showLabel: false,
                                                disabled: this.selectedCount === 0,
                                                onAction: () => this.handleCopy()
                                            };
                                        };
                                        y206.paramsGenerator_ = z206;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(w206, {
                                            iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                            disabled: this.selectedCount === 0
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((s206, t206) => {
                                    if (t206) {
                                        let u206 = new ProteusToolButton(this, { iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() }, undefined, s206, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1173, col: 9 });
                                        ViewPU.create(u206);
                                        let v206 = () => {
                                            return {
                                                iconName: ProteusIconName.PASTE,
                                                tooltip: '粘贴 (Ctrl+V)',
                                                showLabel: false,
                                                onAction: () => this.handlePaste()
                                            };
                                        };
                                        u206.paramsGenerator_ = v206;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(s206, {
                                            iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, g206, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1170, col: 7 });
                    ViewPU.create(i206);
                    let j206 = () => {
                        return {
                            title: 'Edit',
                            content: () => {
                                {
                                    this.observeComponentCreation2((o206, p206) => {
                                        if (p206) {
                                            let q206 = new ProteusToolButton(this, { iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                                disabled: this.selectedCount === 0, onAction: () => this.handleCopy() }, undefined, o206, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1171, col: 9 });
                                            ViewPU.create(q206);
                                            let r206 = () => {
                                                return {
                                                    iconName: ProteusIconName.COPY,
                                                    tooltip: '复制 (Ctrl+C)',
                                                    showLabel: false,
                                                    disabled: this.selectedCount === 0,
                                                    onAction: () => this.handleCopy()
                                                };
                                            };
                                            q206.paramsGenerator_ = r206;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(o206, {
                                                iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                                disabled: this.selectedCount === 0
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((k206, l206) => {
                                        if (l206) {
                                            let m206 = new ProteusToolButton(this, { iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() }, undefined, k206, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1173, col: 9 });
                                            ViewPU.create(m206);
                                            let n206 = () => {
                                                return {
                                                    iconName: ProteusIconName.PASTE,
                                                    tooltip: '粘贴 (Ctrl+V)',
                                                    showLabel: false,
                                                    onAction: () => this.handlePaste()
                                                };
                                            };
                                            m206.paramsGenerator_ = n206;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(k206, {
                                                iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    i206.paramsGenerator_ = j206;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g206, {
                        title: 'Edit'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((w204, x204) => {
                if (x204) {
                    let y204 = new ProteusToolGroup(this, {
                        title: 'View',
                        content: () => {
                            {
                                this.observeComponentCreation2((c206, d206) => {
                                    if (d206) {
                                        let e206 = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false, onAction: () => {
                                                this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                                                this.bumpCanvas();
                                            } }, undefined, c206, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1177, col: 9 });
                                        ViewPU.create(e206);
                                        let f206 = () => {
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
                                        e206.paramsGenerator_ = f206;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(c206, {
                                            iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((y205, z205) => {
                                    if (z205) {
                                        let a206 = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false, onAction: () => {
                                                this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                                                this.bumpCanvas();
                                            } }, undefined, y205, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1181, col: 9 });
                                        ViewPU.create(a206);
                                        let b206 = () => {
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
                                        a206.paramsGenerator_ = b206;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(y205, {
                                            iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((u205, v205) => {
                                    if (v205) {
                                        let w205 = new ProteusToolButton(this, { iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false, onAction: () => {
                                                this.appService.schematicEditor.fitAllInView();
                                                this.bumpCanvas();
                                            } }, undefined, u205, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1185, col: 9 });
                                        ViewPU.create(w205);
                                        let x205 = () => {
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
                                        w205.paramsGenerator_ = x205;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(u205, {
                                            iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((q205, r205) => {
                                    if (r205) {
                                        let s205 = new ProteusToolButton(this, { iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
                                            active: this.gridVisible, onAction: () => this.toggleGrid() }, undefined, q205, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1189, col: 9 });
                                        ViewPU.create(s205);
                                        let t205 = () => {
                                            return {
                                                iconName: ProteusIconName.GRID,
                                                tooltip: '显示/隐藏网格 (G)',
                                                showLabel: false,
                                                active: this.gridVisible,
                                                onAction: () => this.toggleGrid()
                                            };
                                        };
                                        s205.paramsGenerator_ = t205;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(q205, {
                                            iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
                                            active: this.gridVisible
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, w204, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1176, col: 7 });
                    ViewPU.create(y204);
                    let z204 = () => {
                        return {
                            title: 'View',
                            content: () => {
                                {
                                    this.observeComponentCreation2((m205, n205) => {
                                        if (n205) {
                                            let o205 = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false, onAction: () => {
                                                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() * 1.2);
                                                    this.bumpCanvas();
                                                } }, undefined, m205, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1177, col: 9 });
                                            ViewPU.create(o205);
                                            let p205 = () => {
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
                                            o205.paramsGenerator_ = p205;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(m205, {
                                                iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((i205, j205) => {
                                        if (j205) {
                                            let k205 = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false, onAction: () => {
                                                    this.appService.schematicEditor.setZoom(this.appService.schematicEditor.getZoom() / 1.2);
                                                    this.bumpCanvas();
                                                } }, undefined, i205, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1181, col: 9 });
                                            ViewPU.create(k205);
                                            let l205 = () => {
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
                                            k205.paramsGenerator_ = l205;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(i205, {
                                                iconName: ProteusIconName.ZOOM_OUT, tooltip: '缩小 (-)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((e205, f205) => {
                                        if (f205) {
                                            let g205 = new ProteusToolButton(this, { iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false, onAction: () => {
                                                    this.appService.schematicEditor.fitAllInView();
                                                    this.bumpCanvas();
                                                } }, undefined, e205, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1185, col: 9 });
                                            ViewPU.create(g205);
                                            let h205 = () => {
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
                                            g205.paramsGenerator_ = h205;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(e205, {
                                                iconName: ProteusIconName.FIT, tooltip: '适应窗口 (Ctrl+0)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((a205, b205) => {
                                        if (b205) {
                                            let c205 = new ProteusToolButton(this, { iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
                                                active: this.gridVisible, onAction: () => this.toggleGrid() }, undefined, a205, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1189, col: 9 });
                                            ViewPU.create(c205);
                                            let d205 = () => {
                                                return {
                                                    iconName: ProteusIconName.GRID,
                                                    tooltip: '显示/隐藏网格 (G)',
                                                    showLabel: false,
                                                    active: this.gridVisible,
                                                    onAction: () => this.toggleGrid()
                                                };
                                            };
                                            c205.paramsGenerator_ = d205;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(a205, {
                                                iconName: ProteusIconName.GRID, tooltip: '显示/隐藏网格 (G)', showLabel: false,
                                                active: this.gridVisible
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    y204.paramsGenerator_ = z204;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w204, {
                        title: 'View'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((w202, x202) => {
                if (x202) {
                    let y202 = new ProteusToolGroup(this, {
                        title: 'Place',
                        content: () => {
                            {
                                this.observeComponentCreation2((s204, t204) => {
                                    if (t204) {
                                        let u204 = new ProteusToolButton(this, { iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) }, undefined, s204, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1194, col: 9 });
                                        ViewPU.create(u204);
                                        let v204 = () => {
                                            return {
                                                iconName: ProteusIconName.COMPONENT,
                                                tooltip: '放置器件 (P)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.PLACE,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId)
                                            };
                                        };
                                        u204.paramsGenerator_ = v204;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(s204, {
                                            iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.PLACE
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((o204, p204) => {
                                    if (p204) {
                                        let q204 = new ProteusToolButton(this, { iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.WIRE,
                                            disabled: this.simRunning,
                                            onAction: () => this.setToolMode(EditorToolMode.WIRE) }, undefined, o204, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1196, col: 9 });
                                        ViewPU.create(q204);
                                        let r204 = () => {
                                            return {
                                                iconName: ProteusIconName.WIRE,
                                                tooltip: '连线 (W)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.WIRE)
                                            };
                                        };
                                        q204.paramsGenerator_ = r204;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(o204, {
                                            iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.WIRE,
                                            disabled: this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((k204, l204) => {
                                    if (l204) {
                                        let m204 = new ProteusToolButton(this, { iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.BUS,
                                            disabled: this.simRunning,
                                            onAction: () => this.setToolMode(EditorToolMode.BUS) }, undefined, k204, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1200, col: 9 });
                                        ViewPU.create(m204);
                                        let n204 = () => {
                                            return {
                                                iconName: ProteusIconName.BUS,
                                                tooltip: '总线 (B)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.BUS,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.BUS)
                                            };
                                        };
                                        m204.paramsGenerator_ = n204;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(k204, {
                                            iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.BUS,
                                            disabled: this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((g204, h204) => {
                                    if (h204) {
                                        let i204 = new ProteusToolButton(this, { iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) }, undefined, g204, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1204, col: 9 });
                                        ViewPU.create(i204);
                                        let j204 = () => {
                                            return {
                                                iconName: ProteusIconName.LABEL,
                                                tooltip: '网络标签 (L)',
                                                showLabel: false,
                                                active: this.toolMode === EditorToolMode.LABEL,
                                                onAction: () => this.setToolMode(EditorToolMode.LABEL)
                                            };
                                        };
                                        i204.paramsGenerator_ = j204;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(g204, {
                                            iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                            active: this.toolMode === EditorToolMode.LABEL
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((c204, d204) => {
                                    if (d204) {
                                        let e204 = new ProteusToolButton(this, { iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false,
                                            onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') }, undefined, c204, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1206, col: 9 });
                                        ViewPU.create(e204);
                                        let f204 = () => {
                                            return {
                                                iconName: ProteusIconName.POWER,
                                                tooltip: '放置 VCC (Shift+P)',
                                                showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC')
                                            };
                                        };
                                        e204.paramsGenerator_ = f204;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(c204, {
                                            iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((y203, z203) => {
                                    if (z203) {
                                        let a204 = new ProteusToolButton(this, { iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false,
                                            onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }, undefined, y203, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1208, col: 9 });
                                        ViewPU.create(a204);
                                        let b204 = () => {
                                            return {
                                                iconName: ProteusIconName.GROUND,
                                                tooltip: '放置 GND (Shift+G)',
                                                showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND')
                                            };
                                        };
                                        a204.paramsGenerator_ = b204;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(y203, {
                                            iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, w202, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1193, col: 7 });
                    ViewPU.create(y202);
                    let z202 = () => {
                        return {
                            title: 'Place',
                            content: () => {
                                {
                                    this.observeComponentCreation2((u203, v203) => {
                                        if (v203) {
                                            let w203 = new ProteusToolButton(this, { iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) }, undefined, u203, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1194, col: 9 });
                                            ViewPU.create(w203);
                                            let x203 = () => {
                                                return {
                                                    iconName: ProteusIconName.COMPONENT,
                                                    tooltip: '放置器件 (P)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.PLACE,
                                                    onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId)
                                                };
                                            };
                                            w203.paramsGenerator_ = x203;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(u203, {
                                                iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.PLACE
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((q203, r203) => {
                                        if (r203) {
                                            let s203 = new ProteusToolButton(this, { iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.WIRE) }, undefined, q203, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1196, col: 9 });
                                            ViewPU.create(s203);
                                            let t203 = () => {
                                                return {
                                                    iconName: ProteusIconName.WIRE,
                                                    tooltip: '连线 (W)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.WIRE,
                                                    disabled: this.simRunning,
                                                    onAction: () => this.setToolMode(EditorToolMode.WIRE)
                                                };
                                            };
                                            s203.paramsGenerator_ = t203;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(q203, {
                                                iconName: ProteusIconName.WIRE, tooltip: '连线 (W)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((m203, n203) => {
                                        if (n203) {
                                            let o203 = new ProteusToolButton(this, { iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.BUS,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.BUS) }, undefined, m203, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1200, col: 9 });
                                            ViewPU.create(o203);
                                            let p203 = () => {
                                                return {
                                                    iconName: ProteusIconName.BUS,
                                                    tooltip: '总线 (B)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.BUS,
                                                    disabled: this.simRunning,
                                                    onAction: () => this.setToolMode(EditorToolMode.BUS)
                                                };
                                            };
                                            o203.paramsGenerator_ = p203;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(m203, {
                                                iconName: ProteusIconName.BUS, tooltip: '总线 (B)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.BUS,
                                                disabled: this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((i203, j203) => {
                                        if (j203) {
                                            let k203 = new ProteusToolButton(this, { iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) }, undefined, i203, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1204, col: 9 });
                                            ViewPU.create(k203);
                                            let l203 = () => {
                                                return {
                                                    iconName: ProteusIconName.LABEL,
                                                    tooltip: '网络标签 (L)',
                                                    showLabel: false,
                                                    active: this.toolMode === EditorToolMode.LABEL,
                                                    onAction: () => this.setToolMode(EditorToolMode.LABEL)
                                                };
                                            };
                                            k203.paramsGenerator_ = l203;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(i203, {
                                                iconName: ProteusIconName.LABEL, tooltip: '网络标签 (L)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.LABEL
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((e203, f203) => {
                                        if (f203) {
                                            let g203 = new ProteusToolButton(this, { iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') }, undefined, e203, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1206, col: 9 });
                                            ViewPU.create(g203);
                                            let h203 = () => {
                                                return {
                                                    iconName: ProteusIconName.POWER,
                                                    tooltip: '放置 VCC (Shift+P)',
                                                    showLabel: false,
                                                    onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC')
                                                };
                                            };
                                            g203.paramsGenerator_ = h203;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(e203, {
                                                iconName: ProteusIconName.POWER, tooltip: '放置 VCC (Shift+P)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((a203, b203) => {
                                        if (b203) {
                                            let c203 = new ProteusToolButton(this, { iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false,
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }, undefined, a203, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1208, col: 9 });
                                            ViewPU.create(c203);
                                            let d203 = () => {
                                                return {
                                                    iconName: ProteusIconName.GROUND,
                                                    tooltip: '放置 GND (Shift+G)',
                                                    showLabel: false,
                                                    onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND')
                                                };
                                            };
                                            c203.paramsGenerator_ = d203;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(a203, {
                                                iconName: ProteusIconName.GROUND, tooltip: '放置 GND (Shift+G)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    y202.paramsGenerator_ = z202;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w202, {
                        title: 'Place'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((k200, l200) => {
                if (l200) {
                    let m200 = new ProteusToolGroup(this, {
                        title: 'Align',
                        content: () => {
                            {
                                this.observeComponentCreation2((s202, t202) => {
                                    if (t202) {
                                        let u202 = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') }, undefined, s202, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1213, col: 9 });
                                        ViewPU.create(u202);
                                        let v202 = () => {
                                            return {
                                                iconName: ProteusIconName.ALIGN_LEFT,
                                                tooltip: '左对齐',
                                                showLabel: false,
                                                disabled: this.selectedCount < 2,
                                                onAction: () => this.handleAlign('left')
                                            };
                                        };
                                        u202.paramsGenerator_ = v202;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(s202, {
                                            iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                            disabled: this.selectedCount < 2
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((o202, p202) => {
                                    if (p202) {
                                        let q202 = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') }, undefined, o202, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1215, col: 9 });
                                        ViewPU.create(q202);
                                        let r202 = () => {
                                            return {
                                                iconName: ProteusIconName.ALIGN_RIGHT,
                                                tooltip: '右对齐',
                                                showLabel: false,
                                                disabled: this.selectedCount < 2,
                                                onAction: () => this.handleAlign('right')
                                            };
                                        };
                                        q202.paramsGenerator_ = r202;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(o202, {
                                            iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                            disabled: this.selectedCount < 2
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((k202, l202) => {
                                    if (l202) {
                                        let m202 = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') }, undefined, k202, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1217, col: 9 });
                                        ViewPU.create(m202);
                                        let n202 = () => {
                                            return {
                                                iconName: ProteusIconName.ALIGN_TOP,
                                                tooltip: '顶对齐',
                                                showLabel: false,
                                                disabled: this.selectedCount < 2,
                                                onAction: () => this.handleAlign('top')
                                            };
                                        };
                                        m202.paramsGenerator_ = n202;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(k202, {
                                            iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                            disabled: this.selectedCount < 2
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((a202, b202) => {
                                    if (b202) {
                                        let c202 = new ProteusToolButton(this, { iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                            disabled: this.selectedCount < 3, onAction: () => {
                                                const h202 = this.appService.schematicEditor.getSelectedDevices();
                                                if (h202.length >= 3) {
                                                    const i202 = h202.map(j202 => j202.instUuid);
                                                    this.appService.schematicEditor.batchDistribute(i202, 'horiz');
                                                    this.bumpCanvas();
                                                    this.statusMessage = 'Distributed horizontally';
                                                }
                                                else {
                                                    this.statusMessage = 'Select at least 3 components';
                                                }
                                            } }, undefined, a202, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1219, col: 9 });
                                        ViewPU.create(c202);
                                        let d202 = () => {
                                            return {
                                                iconName: ProteusIconName.DISTRIBUTE,
                                                tooltip: '水平均布',
                                                showLabel: false,
                                                disabled: this.selectedCount < 3,
                                                onAction: () => {
                                                    const e202 = this.appService.schematicEditor.getSelectedDevices();
                                                    if (e202.length >= 3) {
                                                        const f202 = e202.map(g202 => g202.instUuid);
                                                        this.appService.schematicEditor.batchDistribute(f202, 'horiz');
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'Distributed horizontally';
                                                    }
                                                    else {
                                                        this.statusMessage = 'Select at least 3 components';
                                                    }
                                                }
                                            };
                                        };
                                        c202.paramsGenerator_ = d202;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(a202, {
                                            iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                            disabled: this.selectedCount < 3
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((w201, x201) => {
                                    if (x201) {
                                        let y201 = new ProteusToolButton(this, { iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() }, undefined, w201, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1231, col: 9 });
                                        ViewPU.create(y201);
                                        let z201 = () => {
                                            return {
                                                iconName: ProteusIconName.ROTATE,
                                                tooltip: '旋转 (R)',
                                                showLabel: false,
                                                disabled: this.selectedComponentId.length === 0,
                                                onAction: () => this.handleRotate()
                                            };
                                        };
                                        y201.paramsGenerator_ = z201;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(w201, {
                                            iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((s201, t201) => {
                                    if (t201) {
                                        let u201 = new ProteusToolButton(this, { iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() }, undefined, s201, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1233, col: 9 });
                                        ViewPU.create(u201);
                                        let v201 = () => {
                                            return {
                                                iconName: ProteusIconName.MIRROR,
                                                tooltip: '镜像 (M)',
                                                showLabel: false,
                                                disabled: this.selectedComponentId.length === 0,
                                                onAction: () => this.handleMirror()
                                            };
                                        };
                                        u201.paramsGenerator_ = v201;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(s201, {
                                            iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                            disabled: this.selectedComponentId.length === 0
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, k200, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1212, col: 7 });
                    ViewPU.create(m200);
                    let n200 = () => {
                        return {
                            title: 'Align',
                            content: () => {
                                {
                                    this.observeComponentCreation2((o201, p201) => {
                                        if (p201) {
                                            let q201 = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') }, undefined, o201, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1213, col: 9 });
                                            ViewPU.create(q201);
                                            let r201 = () => {
                                                return {
                                                    iconName: ProteusIconName.ALIGN_LEFT,
                                                    tooltip: '左对齐',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 2,
                                                    onAction: () => this.handleAlign('left')
                                                };
                                            };
                                            q201.paramsGenerator_ = r201;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(o201, {
                                                iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                                disabled: this.selectedCount < 2
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((k201, l201) => {
                                        if (l201) {
                                            let m201 = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') }, undefined, k201, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1215, col: 9 });
                                            ViewPU.create(m201);
                                            let n201 = () => {
                                                return {
                                                    iconName: ProteusIconName.ALIGN_RIGHT,
                                                    tooltip: '右对齐',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 2,
                                                    onAction: () => this.handleAlign('right')
                                                };
                                            };
                                            m201.paramsGenerator_ = n201;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(k201, {
                                                iconName: ProteusIconName.ALIGN_RIGHT, tooltip: '右对齐', showLabel: false,
                                                disabled: this.selectedCount < 2
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((g201, h201) => {
                                        if (h201) {
                                            let i201 = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') }, undefined, g201, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1217, col: 9 });
                                            ViewPU.create(i201);
                                            let j201 = () => {
                                                return {
                                                    iconName: ProteusIconName.ALIGN_TOP,
                                                    tooltip: '顶对齐',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 2,
                                                    onAction: () => this.handleAlign('top')
                                                };
                                            };
                                            i201.paramsGenerator_ = j201;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(g201, {
                                                iconName: ProteusIconName.ALIGN_TOP, tooltip: '顶对齐', showLabel: false,
                                                disabled: this.selectedCount < 2
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((w200, x200) => {
                                        if (x200) {
                                            let y200 = new ProteusToolButton(this, { iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                                disabled: this.selectedCount < 3, onAction: () => {
                                                    const d201 = this.appService.schematicEditor.getSelectedDevices();
                                                    if (d201.length >= 3) {
                                                        const e201 = d201.map(f201 => f201.instUuid);
                                                        this.appService.schematicEditor.batchDistribute(e201, 'horiz');
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'Distributed horizontally';
                                                    }
                                                    else {
                                                        this.statusMessage = 'Select at least 3 components';
                                                    }
                                                } }, undefined, w200, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1219, col: 9 });
                                            ViewPU.create(y200);
                                            let z200 = () => {
                                                return {
                                                    iconName: ProteusIconName.DISTRIBUTE,
                                                    tooltip: '水平均布',
                                                    showLabel: false,
                                                    disabled: this.selectedCount < 3,
                                                    onAction: () => {
                                                        const a201 = this.appService.schematicEditor.getSelectedDevices();
                                                        if (a201.length >= 3) {
                                                            const b201 = a201.map(c201 => c201.instUuid);
                                                            this.appService.schematicEditor.batchDistribute(b201, 'horiz');
                                                            this.bumpCanvas();
                                                            this.statusMessage = 'Distributed horizontally';
                                                        }
                                                        else {
                                                            this.statusMessage = 'Select at least 3 components';
                                                        }
                                                    }
                                                };
                                            };
                                            y200.paramsGenerator_ = z200;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(w200, {
                                                iconName: ProteusIconName.DISTRIBUTE, tooltip: '水平均布', showLabel: false,
                                                disabled: this.selectedCount < 3
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((s200, t200) => {
                                        if (t200) {
                                            let u200 = new ProteusToolButton(this, { iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() }, undefined, s200, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1231, col: 9 });
                                            ViewPU.create(u200);
                                            let v200 = () => {
                                                return {
                                                    iconName: ProteusIconName.ROTATE,
                                                    tooltip: '旋转 (R)',
                                                    showLabel: false,
                                                    disabled: this.selectedComponentId.length === 0,
                                                    onAction: () => this.handleRotate()
                                                };
                                            };
                                            u200.paramsGenerator_ = v200;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(s200, {
                                                iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((o200, p200) => {
                                        if (p200) {
                                            let q200 = new ProteusToolButton(this, { iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() }, undefined, o200, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1233, col: 9 });
                                            ViewPU.create(q200);
                                            let r200 = () => {
                                                return {
                                                    iconName: ProteusIconName.MIRROR,
                                                    tooltip: '镜像 (M)',
                                                    showLabel: false,
                                                    disabled: this.selectedComponentId.length === 0,
                                                    onAction: () => this.handleMirror()
                                                };
                                            };
                                            q200.paramsGenerator_ = r200;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(o200, {
                                                iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                                                disabled: this.selectedComponentId.length === 0
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    m200.paramsGenerator_ = n200;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(k200, {
                        title: 'Align'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((w198, x198) => {
                if (x198) {
                    let y198 = new ProteusToolGroup(this, {
                        title: 'Sim',
                        content: () => {
                            {
                                this.observeComponentCreation2((g200, h200) => {
                                    if (h200) {
                                        let i200 = new ProteusToolButton(this, {
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
                                        }, undefined, g200, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1238, col: 9 });
                                        ViewPU.create(i200);
                                        let j200 = () => {
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
                                        i200.paramsGenerator_ = j200;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(g200, {
                                            iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                            tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)', showLabel: false,
                                            active: this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((c200, d200) => {
                                    if (d200) {
                                        let e200 = new ProteusToolButton(this, { iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                            disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); } }, undefined, c200, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1252, col: 9 });
                                        ViewPU.create(e200);
                                        let f200 = () => {
                                            return {
                                                iconName: ProteusIconName.PAUSE,
                                                tooltip: '暂停仿真 (F6)',
                                                showLabel: false,
                                                disabled: !this.simRunning,
                                                onAction: () => { this.toggleSimPause(); }
                                            };
                                        };
                                        e200.paramsGenerator_ = f200;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(c200, {
                                            iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                            disabled: !this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((s199, t199) => {
                                    if (t199) {
                                        let u199 = new ProteusToolButton(this, { iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false, onAction: () => {
                                                const z199 = this.appService.runErc(false);
                                                this.ercErrors = z199;
                                                const a200 = z199.filter(b200 => b200.severity === 'error' || b200.severity === 'critical').length;
                                                this.ercCount = z199.length;
                                                this.navTab = 3;
                                                this.statusMessage = `ERC: ${z199.length} issues (${a200} errors)`;
                                            } }, undefined, s199, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1254, col: 9 });
                                        ViewPU.create(u199);
                                        let v199 = () => {
                                            return {
                                                iconName: ProteusIconName.ERC,
                                                tooltip: '电气规则检查 (F7)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const w199 = this.appService.runErc(false);
                                                    this.ercErrors = w199;
                                                    const x199 = w199.filter(y199 => y199.severity === 'error' || y199.severity === 'critical').length;
                                                    this.ercCount = w199.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `ERC: ${w199.length} issues (${x199} errors)`;
                                                }
                                            };
                                        };
                                        u199.paramsGenerator_ = v199;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(s199, {
                                            iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, w198, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1237, col: 7 });
                    ViewPU.create(y198);
                    let z198 = () => {
                        return {
                            title: 'Sim',
                            content: () => {
                                {
                                    this.observeComponentCreation2((o199, p199) => {
                                        if (p199) {
                                            let q199 = new ProteusToolButton(this, {
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
                                            }, undefined, o199, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1238, col: 9 });
                                            ViewPU.create(q199);
                                            let r199 = () => {
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
                                            q199.paramsGenerator_ = r199;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(o199, {
                                                iconName: this.simRunning ? ProteusIconName.STOP : ProteusIconName.PLAY,
                                                tooltip: this.simRunning ? '停止仿真 (Shift+F5)' : '运行仿真 (F5)', showLabel: false,
                                                active: this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((k199, l199) => {
                                        if (l199) {
                                            let m199 = new ProteusToolButton(this, { iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                                disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); } }, undefined, k199, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1252, col: 9 });
                                            ViewPU.create(m199);
                                            let n199 = () => {
                                                return {
                                                    iconName: ProteusIconName.PAUSE,
                                                    tooltip: '暂停仿真 (F6)',
                                                    showLabel: false,
                                                    disabled: !this.simRunning,
                                                    onAction: () => { this.toggleSimPause(); }
                                                };
                                            };
                                            m199.paramsGenerator_ = n199;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(k199, {
                                                iconName: ProteusIconName.PAUSE, tooltip: '暂停仿真 (F6)', showLabel: false,
                                                disabled: !this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((a199, b199) => {
                                        if (b199) {
                                            let c199 = new ProteusToolButton(this, { iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false, onAction: () => {
                                                    const h199 = this.appService.runErc(false);
                                                    this.ercErrors = h199;
                                                    const i199 = h199.filter(j199 => j199.severity === 'error' || j199.severity === 'critical').length;
                                                    this.ercCount = h199.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `ERC: ${h199.length} issues (${i199} errors)`;
                                                } }, undefined, a199, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1254, col: 9 });
                                            ViewPU.create(c199);
                                            let d199 = () => {
                                                return {
                                                    iconName: ProteusIconName.ERC,
                                                    tooltip: '电气规则检查 (F7)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const e199 = this.appService.runErc(false);
                                                        this.ercErrors = e199;
                                                        const f199 = e199.filter(g199 => g199.severity === 'error' || g199.severity === 'critical').length;
                                                        this.ercCount = e199.length;
                                                        this.navTab = 3;
                                                        this.statusMessage = `ERC: ${e199.length} issues (${f199} errors)`;
                                                    }
                                                };
                                            };
                                            c199.paramsGenerator_ = d199;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(a199, {
                                                iconName: ProteusIconName.ERC, tooltip: '电气规则检查 (F7)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    y198.paramsGenerator_ = z198;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w198, {
                        title: 'Sim'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        {
            this.observeComponentCreation2((i197, j197) => {
                if (j197) {
                    let k197 = new ProteusToolGroup(this, {
                        title: 'AI',
                        content: () => {
                            {
                                this.observeComponentCreation2((q198, r198) => {
                                    if (r198) {
                                        let s198 = new ProteusToolButton(this, { iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false, onAction: async () => {
                                                this.statusMessage = 'AI auto-routing...';
                                                const v198 = await this.appService.aiAutoRoute();
                                                if (v198) {
                                                    this.bumpCanvas();
                                                    this.statusMessage = 'AI routing complete';
                                                }
                                            } }, undefined, q198, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1265, col: 9 });
                                        ViewPU.create(s198);
                                        let t198 = () => {
                                            return {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                tooltip: 'AI 自动布线 (F8)',
                                                showLabel: false,
                                                onAction: async () => {
                                                    this.statusMessage = 'AI auto-routing...';
                                                    const u198 = await this.appService.aiAutoRoute();
                                                    if (u198) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI routing complete';
                                                    }
                                                }
                                            };
                                        };
                                        s198.paramsGenerator_ = t198;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(q198, {
                                            iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((k198, l198) => {
                                    if (l198) {
                                        let m198 = new ProteusToolButton(this, { iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false, onAction: async () => {
                                                this.statusMessage = 'AI layout optimizing...';
                                                const p198 = await this.appService.aiOptimizePlacement();
                                                if (p198) {
                                                    this.bumpCanvas();
                                                    this.statusMessage = 'AI layout optimized';
                                                }
                                            } }, undefined, k198, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1274, col: 9 });
                                        ViewPU.create(m198);
                                        let n198 = () => {
                                            return {
                                                iconName: ProteusIconName.AI_LAYOUT,
                                                tooltip: 'AI 优化布局 (F9)',
                                                showLabel: false,
                                                onAction: async () => {
                                                    this.statusMessage = 'AI layout optimizing...';
                                                    const o198 = await this.appService.aiOptimizePlacement();
                                                    if (o198) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI layout optimized';
                                                    }
                                                }
                                            };
                                        };
                                        m198.paramsGenerator_ = n198;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(k198, {
                                            iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((e198, f198) => {
                                    if (f198) {
                                        let g198 = new ProteusToolButton(this, { iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false, onAction: () => {
                                                const j198 = this.appService.runErc(true);
                                                this.ercErrors = j198;
                                                this.ercCount = j198.length;
                                                this.navTab = 3;
                                                this.statusMessage = `AI diagnosis: ${j198.length} issues`;
                                            } }, undefined, e198, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1283, col: 9 });
                                        ViewPU.create(g198);
                                        let h198 = () => {
                                            return {
                                                iconName: ProteusIconName.AI_DIAG,
                                                tooltip: 'AI 电路诊断 (F10)',
                                                showLabel: false,
                                                onAction: () => {
                                                    const i198 = this.appService.runErc(true);
                                                    this.ercErrors = i198;
                                                    this.ercCount = i198.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `AI diagnosis: ${i198.length} issues`;
                                                }
                                            };
                                        };
                                        g198.paramsGenerator_ = h198;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(e198, {
                                            iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                        }
                    }, undefined, i197, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1264, col: 7 });
                    ViewPU.create(k197);
                    let l197 = () => {
                        return {
                            title: 'AI',
                            content: () => {
                                {
                                    this.observeComponentCreation2((y197, z197) => {
                                        if (z197) {
                                            let a198 = new ProteusToolButton(this, { iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false, onAction: async () => {
                                                    this.statusMessage = 'AI auto-routing...';
                                                    const d198 = await this.appService.aiAutoRoute();
                                                    if (d198) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI routing complete';
                                                    }
                                                } }, undefined, y197, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1265, col: 9 });
                                            ViewPU.create(a198);
                                            let b198 = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_ROUTE,
                                                    tooltip: 'AI 自动布线 (F8)',
                                                    showLabel: false,
                                                    onAction: async () => {
                                                        this.statusMessage = 'AI auto-routing...';
                                                        const c198 = await this.appService.aiAutoRoute();
                                                        if (c198) {
                                                            this.bumpCanvas();
                                                            this.statusMessage = 'AI routing complete';
                                                        }
                                                    }
                                                };
                                            };
                                            a198.paramsGenerator_ = b198;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(y197, {
                                                iconName: ProteusIconName.AI_ROUTE, tooltip: 'AI 自动布线 (F8)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((s197, t197) => {
                                        if (t197) {
                                            let u197 = new ProteusToolButton(this, { iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false, onAction: async () => {
                                                    this.statusMessage = 'AI layout optimizing...';
                                                    const x197 = await this.appService.aiOptimizePlacement();
                                                    if (x197) {
                                                        this.bumpCanvas();
                                                        this.statusMessage = 'AI layout optimized';
                                                    }
                                                } }, undefined, s197, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1274, col: 9 });
                                            ViewPU.create(u197);
                                            let v197 = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_LAYOUT,
                                                    tooltip: 'AI 优化布局 (F9)',
                                                    showLabel: false,
                                                    onAction: async () => {
                                                        this.statusMessage = 'AI layout optimizing...';
                                                        const w197 = await this.appService.aiOptimizePlacement();
                                                        if (w197) {
                                                            this.bumpCanvas();
                                                            this.statusMessage = 'AI layout optimized';
                                                        }
                                                    }
                                                };
                                            };
                                            u197.paramsGenerator_ = v197;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(s197, {
                                                iconName: ProteusIconName.AI_LAYOUT, tooltip: 'AI 优化布局 (F9)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((m197, n197) => {
                                        if (n197) {
                                            let o197 = new ProteusToolButton(this, { iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false, onAction: () => {
                                                    const r197 = this.appService.runErc(true);
                                                    this.ercErrors = r197;
                                                    this.ercCount = r197.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `AI diagnosis: ${r197.length} issues`;
                                                } }, undefined, m197, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1283, col: 9 });
                                            ViewPU.create(o197);
                                            let p197 = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_DIAG,
                                                    tooltip: 'AI 电路诊断 (F10)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        const q197 = this.appService.runErc(true);
                                                        this.ercErrors = q197;
                                                        this.ercCount = q197.length;
                                                        this.navTab = 3;
                                                        this.statusMessage = `AI diagnosis: ${q197.length} issues`;
                                                    }
                                                };
                                            };
                                            o197.paramsGenerator_ = p197;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(m197, {
                                                iconName: ProteusIconName.AI_DIAG, tooltip: 'AI 电路诊断 (F10)', showLabel: false
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                            }
                        };
                    };
                    k197.paramsGenerator_ = l197;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i197, {
                        title: 'AI'
                    });
                }
            }, { name: "ProteusToolGroup" });
        }
        this.observeComponentCreation2((g197, h197) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        {
            this.observeComponentCreation2((c197, d197) => {
                if (d197) {
                    let e197 = new ProteusToolButton(this, { iconName: ProteusIconName.MORE, tooltip: '更多工具', showLabel: false,
                        onAction: () => { this.statusMessage = 'All tools available in menus'; } }, undefined, c197, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1295, col: 7 });
                    ViewPU.create(e197);
                    let f197 = () => {
                        return {
                            iconName: ProteusIconName.MORE,
                            tooltip: '更多工具',
                            showLabel: false,
                            onAction: () => { this.statusMessage = 'All tools available in menus'; }
                        };
                    };
                    e197.paramsGenerator_ = f197;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(c197, {
                        iconName: ProteusIconName.MORE, tooltip: '更多工具', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        Row.pop();
    }
    LeftPanel(w193 = null) {
        this.observeComponentCreation2((z196, a197) => {
            Column.create();
            Column.width(this.leftPanelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: { right: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        this.observeComponentCreation2((d195, e195) => {
            If.create();
            if (!this.leftLibCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((x196, y196) => {
                        Column.create();
                        Column.layoutWeight(3);
                        Column.width('100%');
                    }, Column);
                    {
                        this.observeComponentCreation2((t196, u196) => {
                            if (u196) {
                                let v196 = new ProteusPanelTitle(this, {
                                    title: { "id": 83886091, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false,
                                    onToggle: () => { this.leftLibCollapsed = true; this.uiState.leftLibCollapsed = true; }
                                }, undefined, t196, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1311, col: 11 });
                                ViewPU.create(v196);
                                let w196 = () => {
                                    return {
                                        title: { "id": 83886091, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        collapsed: false,
                                        onToggle: () => { this.leftLibCollapsed = true; this.uiState.leftLibCollapsed = true; }
                                    };
                                };
                                v196.paramsGenerator_ = w196;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(t196, {
                                    title: { "id": 83886091, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false
                                });
                            }
                        }, { name: "ProteusPanelTitle" });
                    }
                    this.observeComponentCreation2((q196, r196) => {
                        TextInput.create({ placeholder: { "id": 83886130, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, text: this.searchKeyword });
                        TextInput.height(ProteusDimens.SEARCH_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_KEY);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.BORDER });
                        TextInput.margin({ left: 4, right: 4, top: 4, bottom: 2 });
                        TextInput.onChange((s196: string) => {
                            this.searchKeyword = s196;
                            this.refreshComponentList();
                        });
                    }, TextInput);
                    this.observeComponentCreation2((o196, p196) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.width('100%');
                        Scroll.scrollBar(BarState.Auto);
                    }, Scroll);
                    this.observeComponentCreation2((m196, n196) => {
                        Column.create();
                        Column.width('100%');
                    }, Column);
                    this.observeComponentCreation2((l195, m195) => {
                        If.create();
                        if (this.searchKeyword.length > 0) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((c196, d196) => {
                                    ForEach.create();
                                    const e196 = g196 => {
                                        const h196 = g196;
                                        {
                                            this.observeComponentCreation2((i196, j196) => {
                                                if (j196) {
                                                    let k196 = new ProteusTreeRow(this, {
                                                        label: h196.split('|')[1] ?? h196,
                                                        selected: this.selectedTreeItem === h196,
                                                        onClickRow: () => this.selectLibraryItem(h196),
                                                        onDoubleClick: () => this.placeComponent(h196.split('|')[0])
                                                    }, undefined, i196, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1333, col: 19 });
                                                    ViewPU.create(k196);
                                                    let l196 = () => {
                                                        return {
                                                            label: h196.split('|')[1] ?? h196,
                                                            selected: this.selectedTreeItem === h196,
                                                            onClickRow: () => this.selectLibraryItem(h196),
                                                            onDoubleClick: () => this.placeComponent(h196.split('|')[0])
                                                        };
                                                    };
                                                    k196.paramsGenerator_ = l196;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(i196, {
                                                        label: h196.split('|')[1] ?? h196,
                                                        selected: this.selectedTreeItem === h196
                                                    });
                                                }
                                            }, { name: "ProteusTreeRow" });
                                        }
                                    };
                                    this.forEachUpdateFunction(c196, this.componentList, e196, (f196: string) => f196, false, false);
                                }, ForEach);
                                ForEach.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                                this.observeComponentCreation2((n195, o195) => {
                                    ForEach.create();
                                    const p195 = (r195, s195: number) => {
                                        const t195 = r195;
                                        this.observeComponentCreation2((a196, b196) => {
                                            Column.create();
                                        }, Column);
                                        {
                                            this.observeComponentCreation2((w195, x195) => {
                                                if (x195) {
                                                    let y195 = new ProteusTreeRow(this, {
                                                        label: t195.label,
                                                        expandable: true,
                                                        expanded: this.expandedCategories.has(t195.cat),
                                                        onToggleExpand: () => { this.toggleCategory(t195.cat); },
                                                        onClickRow: () => { this.toggleCategory(t195.cat); }
                                                    }, undefined, w195, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1343, col: 21 });
                                                    ViewPU.create(y195);
                                                    let z195 = () => {
                                                        return {
                                                            label: t195.label,
                                                            expandable: true,
                                                            expanded: this.expandedCategories.has(t195.cat),
                                                            onToggleExpand: () => { this.toggleCategory(t195.cat); },
                                                            onClickRow: () => { this.toggleCategory(t195.cat); }
                                                        };
                                                    };
                                                    y195.paramsGenerator_ = z195;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(w195, {
                                                        label: t195.label,
                                                        expandable: true,
                                                        expanded: this.expandedCategories.has(t195.cat)
                                                    });
                                                }
                                            }, { name: "ProteusTreeRow" });
                                        }
                                        this.observeComponentCreation2((u195, v195) => {
                                            If.create();
                                            if (this.expandedCategories.has(t195.cat)) {
                                                this.ifElseBranchUpdateFunction(0, () => {
                                                    this.CategoryItems.bind(this)(t195.cat);
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
                                    this.forEachUpdateFunction(n195, this.categoryNodes, p195, (q195: CategoryNode) => q195.cat, true, false);
                                }, ForEach);
                                ForEach.pop();
                            });
                        }
                    }, If);
                    If.pop();
                    Column.pop();
                    Scroll.pop();
                    this.observeComponentCreation2((j195, k195) => {
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
                        this.observeComponentCreation2((f195, g195) => {
                            if (g195) {
                                let h195 = new ComponentPreview(this, { libraryId: this.previewComponentId }, undefined, f195, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1363, col: 11 });
                                ViewPU.create(h195);
                                let i195 = () => {
                                    return {
                                        libraryId: this.previewComponentId
                                    };
                                };
                                h195.paramsGenerator_ = i195;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(f195, {
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
        this.observeComponentCreation2((x193, y193) => {
            If.create();
            if (!this.leftNavCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((b195, c195) => {
                        Column.create();
                        Column.layoutWeight(1);
                        Column.width('100%');
                        Column.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
                    }, Column);
                    {
                        this.observeComponentCreation2((x194, y194) => {
                            if (y194) {
                                let z194 = new ProteusPanelTitle(this, {
                                    title: { "id": 83886092, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false,
                                    onToggle: () => { this.leftNavCollapsed = true; this.uiState.leftNavCollapsed = true; }
                                }, undefined, x194, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1380, col: 11 });
                                ViewPU.create(z194);
                                let a195 = () => {
                                    return {
                                        title: { "id": 83886092, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        collapsed: false,
                                        onToggle: () => { this.leftNavCollapsed = true; this.uiState.leftNavCollapsed = true; }
                                    };
                                };
                                z194.paramsGenerator_ = a195;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(x194, {
                                    title: { "id": 83886092, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    collapsed: false
                                });
                            }
                        }, { name: "ProteusPanelTitle" });
                    }
                    this.observeComponentCreation2((v194, w194) => {
                        Row.create();
                        Row.width('100%');
                        Row.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                    }, Row);
                    {
                        this.observeComponentCreation2((r194, s194) => {
                            if (s194) {
                                let t194 = new ProteusNavTab(this, { label: { "id": 83886106, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 0, onSelect: () => { this.navTab = 0; } }, undefined, r194, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1386, col: 13 });
                                ViewPU.create(t194);
                                let u194 = () => {
                                    return {
                                        label: { "id": 83886106, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 0,
                                        onSelect: () => { this.navTab = 0; }
                                    };
                                };
                                t194.paramsGenerator_ = u194;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(r194, {
                                    label: { "id": 83886106, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 0
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    {
                        this.observeComponentCreation2((n194, o194) => {
                            if (o194) {
                                let p194 = new ProteusNavTab(this, { label: { "id": 83886102, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 1, onSelect: () => { this.navTab = 1; } }, undefined, n194, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1387, col: 13 });
                                ViewPU.create(p194);
                                let q194 = () => {
                                    return {
                                        label: { "id": 83886102, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 1,
                                        onSelect: () => { this.navTab = 1; }
                                    };
                                };
                                p194.paramsGenerator_ = q194;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(n194, {
                                    label: { "id": 83886102, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 1
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    {
                        this.observeComponentCreation2((j194, k194) => {
                            if (k194) {
                                let l194 = new ProteusNavTab(this, { label: { "id": 83886104, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 2, onSelect: () => { this.navTab = 2; } }, undefined, j194, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1388, col: 13 });
                                ViewPU.create(l194);
                                let m194 = () => {
                                    return {
                                        label: { "id": 83886104, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 2,
                                        onSelect: () => { this.navTab = 2; }
                                    };
                                };
                                l194.paramsGenerator_ = m194;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(j194, {
                                    label: { "id": 83886104, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 2
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    {
                        this.observeComponentCreation2((f194, g194) => {
                            if (g194) {
                                let h194 = new ProteusNavTab(this, { label: { "id": 83886103, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 3, onSelect: () => { this.navTab = 3; } }, undefined, f194, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1389, col: 13 });
                                ViewPU.create(h194);
                                let i194 = () => {
                                    return {
                                        label: { "id": 83886103, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        selected: this.navTab === 3,
                                        onSelect: () => { this.navTab = 3; }
                                    };
                                };
                                h194.paramsGenerator_ = i194;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(f194, {
                                    label: { "id": 83886103, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 3
                                });
                            }
                        }, { name: "ProteusNavTab" });
                    }
                    Row.pop();
                    this.observeComponentCreation2((d194, e194) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.width('100%');
                        Scroll.backgroundColor(ProteusColors.CANVAS_BG);
                    }, Scroll);
                    this.observeComponentCreation2((b194, c194) => {
                        Column.create();
                        Column.width('100%');
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((z193, a194) => {
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
    CategoryItems(k193: ComponentCategory, l193 = null) {
        this.observeComponentCreation2((m193, n193) => {
            ForEach.create();
            const o193 = q193 => {
                const r193 = q193;
                {
                    this.observeComponentCreation2((s193, t193) => {
                        if (t193) {
                            let u193 = new ProteusTreeRow(this, {
                                label: r193.split('|')[1] ?? r193,
                                depth: 1,
                                selected: this.selectedTreeItem === r193,
                                onClickRow: () => this.selectLibraryItem(r193),
                                onDoubleClick: () => this.placeComponent(r193.split('|')[0])
                            }, undefined, s193, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1427, col: 7 });
                            ViewPU.create(u193);
                            let v193 = () => {
                                return {
                                    label: r193.split('|')[1] ?? r193,
                                    depth: 1,
                                    selected: this.selectedTreeItem === r193,
                                    onClickRow: () => this.selectLibraryItem(r193),
                                    onDoubleClick: () => this.placeComponent(r193.split('|')[0])
                                };
                            };
                            u193.paramsGenerator_ = v193;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(s193, {
                                label: r193.split('|')[1] ?? r193,
                                depth: 1,
                                selected: this.selectedTreeItem === r193
                            });
                        }
                    }, { name: "ProteusTreeRow" });
                }
            };
            this.forEachUpdateFunction(m193, this.getCategoryItems(k193), o193, (p193: string) => p193, false, false);
        }, ForEach);
        ForEach.pop();
    }
    getCategoryItems(h193: ComponentCategory): string[] {
        const i193 = this.appService.componentLibrary.listByCategory(h193, 1, 30);
        return i193.items.map(j193 => `${j193.id}|${j193.name}`);
    }
    NavSheetTree(y192 = null) {
        {
            this.observeComponentCreation2((d193, e193) => {
                if (e193) {
                    let f193 = new ProteusTreeRow(this, {
                        label: this.projectName,
                        expandable: true,
                        expanded: true,
                        selected: true,
                        onClickRow: () => { },
                        onToggleExpand: () => { }
                    }, undefined, d193, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1444, col: 5 });
                    ViewPU.create(f193);
                    let g193 = () => {
                        return {
                            label: this.projectName,
                            expandable: true,
                            expanded: true,
                            selected: true,
                            onClickRow: () => { },
                            onToggleExpand: () => { }
                        };
                    };
                    f193.paramsGenerator_ = g193;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(d193, {
                        label: this.projectName,
                        expandable: true,
                        expanded: true,
                        selected: true
                    });
                }
            }, { name: "ProteusTreeRow" });
        }
        {
            this.observeComponentCreation2((z192, a193) => {
                if (a193) {
                    let b193 = new ProteusTreeRow(this, {
                        label: { "id": 83886105, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        depth: 1,
                        selected: false,
                        onClickRow: () => { }
                    }, undefined, z192, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1452, col: 5 });
                    ViewPU.create(b193);
                    let c193 = () => {
                        return {
                            label: { "id": 83886105, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            depth: 1,
                            selected: false,
                            onClickRow: () => { }
                        };
                    };
                    b193.paramsGenerator_ = c193;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(z192, {
                        label: { "id": 83886105, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        depth: 1,
                        selected: false
                    });
                }
            }, { name: "ProteusTreeRow" });
        }
    }
    NavComponentList(l192 = null) {
        this.observeComponentCreation2((m192, n192) => {
            ForEach.create();
            const o192 = q192 => {
                const r192 = q192;
                this.observeComponentCreation2((w192, x192) => {
                    Row.create();
                    Row.width('100%');
                    Row.height(ProteusDimens.NAV_ROW_HEIGHT);
                    Row.padding({ left: 6, right: 4 });
                    Row.alignItems(VerticalAlign.Center);
                    Row.backgroundColor(r192.id === this.selectedComponentId ? ProteusColors.TREE_SELECTED : Color.Transparent);
                    Row.border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER });
                    Row.onClick(() => {
                        this.selectedComponentId = r192.id;
                        this.appService.schematicEditor.setSelection([r192.id]);
                    });
                }, Row);
                this.observeComponentCreation2((u192, v192) => {
                    Text.create(`${r192.refDes}`);
                    Text.fontSize(ProteusFonts.PARAM_KEY);
                    Text.fontColor(r192.id === this.selectedComponentId ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY);
                    Text.fontWeight(FontWeight.Medium);
                    Text.width(60);
                    Text.maxLines(1);
                    Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                }, Text);
                Text.pop();
                this.observeComponentCreation2((s192, t192) => {
                    Text.create(`${r192.libraryId}`);
                    Text.fontSize(ProteusFonts.STATUS);
                    Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    Text.layoutWeight(1);
                    Text.maxLines(1);
                    Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                }, Text);
                Text.pop();
                Row.pop();
            };
            this.forEachUpdateFunction(m192, this.getDocComponents(), o192, (p192: ComponentInstance) => `${p192.id}_${this.navRefreshKey}`, false, false);
        }, ForEach);
        ForEach.pop();
    }
    getDocComponents(): ComponentInstance[] {
        return this.appService.schematicEditor.getDocument().components;
    }
    NavNetList(y191 = null) {
        this.observeComponentCreation2((z191, a192) => {
            ForEach.create();
            const b192 = (e192, f192: number) => {
                const g192 = e192;
                this.observeComponentCreation2((j192, k192) => {
                    Row.create();
                    Row.width('100%');
                    Row.height(ProteusDimens.NAV_ROW_HEIGHT + 2);
                    Row.padding({ left: 8, right: 4 });
                    Row.alignItems(VerticalAlign.Center);
                    Row.border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER });
                }, Row);
                this.observeComponentCreation2((h192, i192) => {
                    Text.create(`NET ${f192 + 1}`);
                    Text.fontSize(ProteusFonts.PARAM_KEY);
                    Text.fontColor(ProteusColors.WIRE);
                    Text.fontWeight(FontWeight.Medium);
                    Text.maxLines(1);
                }, Text);
                Text.pop();
                Row.pop();
            };
            this.forEachUpdateFunction(z191, this.getDocNets(), b192, (c192: string, d192: number) => `${c192}_${d192}`, true, true);
        }, ForEach);
        ForEach.pop();
    }
    getDocNets(): string[] {
        const t191: SchematicDocument = this.appService.schematicEditor.getDocument();
        const u191: Set<string> = new Set();
        for (let x191 = 0; x191 < t191.wires.length; x191++) {
            u191.add(t191.wires[x191].netId);
        }
        const v191: string[] = [];
        u191.forEach((w191: string) => v191.push(w191));
        return v191;
    }
    NavErrorList(w190 = null) {
        this.observeComponentCreation2((x190, y190) => {
            If.create();
            if (this.ercErrors.length === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((r191, s191) => {
                        Row.create();
                        Row.padding({ left: 8, top: 8 });
                    }, Row);
                    this.observeComponentCreation2((p191, q191) => {
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
                    this.observeComponentCreation2((z190, a191) => {
                        ForEach.create();
                        const b191 = (e191, f191: number) => {
                            const g191 = e191;
                            this.observeComponentCreation2((n191, o191) => {
                                Row.create();
                                Row.width('100%');
                                Row.height(ProteusDimens.NAV_ROW_HEIGHT);
                                Row.padding({ left: 6, right: 4 });
                                Row.alignItems(VerticalAlign.Center);
                                Row.border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER });
                            }, Row);
                            this.observeComponentCreation2((l191, m191) => {
                                Column.create();
                            }, Column);
                            this.observeComponentCreation2((j191, k191) => {
                                Text.create(g191.severity === 'error' || g191.severity === 'critical' ? '✕' : '⚠');
                                Text.fontSize(10);
                                Text.fontColor(g191.severity === 'error' || g191.severity === 'critical' ?
                                    ProteusColors.ERC_ERR : ProteusColors.ERC_WARN);
                                Text.width(16);
                            }, Text);
                            Text.pop();
                            Column.pop();
                            this.observeComponentCreation2((h191, i191) => {
                                Text.create(g191.desc);
                                Text.fontSize(ProteusFonts.STATUS);
                                Text.fontColor(g191.severity === 'error' || g191.severity === 'critical' ?
                                    ProteusColors.ERC_ERR : ProteusColors.ERC_WARN);
                                Text.layoutWeight(1);
                                Text.maxLines(1);
                                Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                            }, Text);
                            Text.pop();
                            Row.pop();
                        };
                        this.forEachUpdateFunction(z190, this.ercErrors, b191, (c191: ErcError, d191: number) => `${d191}_${c191.desc}`, true, true);
                    }, ForEach);
                    ForEach.pop();
                });
            }
        }, If);
        If.pop();
    }
    CanvasArea(j190 = null) {
        this.observeComponentCreation2((u190, v190) => {
            Stack.create({ alignContent: Alignment.BottomEnd });
            Stack.layoutWeight(1);
            Stack.height('100%');
            Stack.border({ width: 1, color: ProteusColors.DIVIDER });
        }, Stack);
        this.observeComponentCreation2((s190, t190) => {
            __Common__.create();
            __Common__.width('100%');
            __Common__.height('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((m190, n190) => {
                if (n190) {
                    let o190 = new SchematicCanvas(this, {
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
                        onStatusChange: (r190: string) => { this.statusMessage = r190; },
                        onDocumentChanged: () => { this.bumpCanvas(); },
                        onCopySelected: () => { this.handleCopy(); },
                        onDeleteSelected: () => { this.handleDeleteSelected(); }
                    }, undefined, m190, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1563, col: 7 });
                    ViewPU.create(o190);
                    let p190 = () => {
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
                            onStatusChange: (q190: string) => { this.statusMessage = q190; },
                            onDocumentChanged: () => { this.bumpCanvas(); },
                            onCopySelected: () => { this.handleCopy(); },
                            onDeleteSelected: () => { this.handleDeleteSelected(); }
                        };
                    };
                    o190.paramsGenerator_ = p190;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(m190, {
                        rulerVisible: this.rulerVisible,
                        ercErrors: this.ercErrors
                    });
                }
            }, { name: "SchematicCanvas" });
        }
        __Common__.pop();
        this.observeComponentCreation2((k190, l190) => {
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
    FloatingToolBar(c189 = null) {
        this.observeComponentCreation2((h190, i190) => {
            Row.create();
            Row.backgroundColor(ProteusColors.CANVAS_BG);
            Row.border({ width: 1, color: ProteusColors.BORDER });
            Row.padding(2);
            Row.margin({ right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((d190, e190) => {
                if (e190) {
                    let f190 = new ProteusToolButton(this, { iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false,
                        onAction: () => this.handleRotate() }, undefined, d190, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1596, col: 7 });
                    ViewPU.create(f190);
                    let g190 = () => {
                        return {
                            iconName: ProteusIconName.ROTATE,
                            tooltip: '旋转 (R)',
                            showLabel: false,
                            onAction: () => this.handleRotate()
                        };
                    };
                    f190.paramsGenerator_ = g190;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(d190, {
                        iconName: ProteusIconName.ROTATE, tooltip: '旋转 (R)', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((z189, a190) => {
                if (a190) {
                    let b190 = new ProteusToolButton(this, { iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false,
                        onAction: () => this.handleMirror() }, undefined, z189, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1598, col: 7 });
                    ViewPU.create(b190);
                    let c190 = () => {
                        return {
                            iconName: ProteusIconName.MIRROR,
                            tooltip: '镜像 (M)',
                            showLabel: false,
                            onAction: () => this.handleMirror()
                        };
                    };
                    b190.paramsGenerator_ = c190;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(z189, {
                        iconName: ProteusIconName.MIRROR, tooltip: '镜像 (M)', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((v189, w189) => {
                if (w189) {
                    let x189 = new ProteusToolButton(this, { iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false,
                        onAction: () => this.handleDeleteSelected() }, undefined, v189, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1600, col: 7 });
                    ViewPU.create(x189);
                    let y189 = () => {
                        return {
                            iconName: ProteusIconName.TRASH,
                            tooltip: '删除 (Del)',
                            showLabel: false,
                            onAction: () => this.handleDeleteSelected()
                        };
                    };
                    x189.paramsGenerator_ = y189;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(v189, {
                        iconName: ProteusIconName.TRASH, tooltip: '删除 (Del)', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((r189, s189) => {
                if (s189) {
                    let t189 = new ProteusToolButton(this, { iconName: ProteusIconName.SETTINGS, tooltip: '属性面板', showLabel: false,
                        onAction: () => {
                            this.rightCollapsed = false;
                            this.uiState.rightCollapsed = false;
                            this.setActiveRightTab(0);
                        } }, undefined, r189, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1602, col: 7 });
                    ViewPU.create(t189);
                    let u189 = () => {
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
                    t189.paramsGenerator_ = u189;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(r189, {
                        iconName: ProteusIconName.SETTINGS, tooltip: '属性面板', showLabel: false
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        this.observeComponentCreation2((d189, e189) => {
            If.create();
            if (this.debugTabHasBadge) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((f189, g189) => {
                            if (g189) {
                                let h189 = new ProteusToolButton(this, { iconName: ProteusIconName.PLAY, tooltip: '烧录 HEX', showLabel: false, onAction: () => {
                                        const n189 = this.appService.schematicEditor.getDocument();
                                        const o189 = n189.components.find(q189 => q189.id === this.selectedComponentId);
                                        if (o189) {
                                            const p189 = o189.libraryId.toUpperCase();
                                            if (p189.startsWith('AT89') || p189.startsWith('STC')) {
                                                this.burnMcuFamily = '8051';
                                            }
                                            else {
                                                this.burnMcuFamily = 'STM32';
                                            }
                                            this.burnFilePath = '';
                                            this.showBurnDialog = true;
                                        }
                                    } }, undefined, f189, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1609, col: 9 });
                                ViewPU.create(h189);
                                let i189 = () => {
                                    return {
                                        iconName: ProteusIconName.PLAY,
                                        tooltip: '烧录 HEX',
                                        showLabel: false,
                                        onAction: () => {
                                            const j189 = this.appService.schematicEditor.getDocument();
                                            const k189 = j189.components.find(m189 => m189.id === this.selectedComponentId);
                                            if (k189) {
                                                const l189 = k189.libraryId.toUpperCase();
                                                if (l189.startsWith('AT89') || l189.startsWith('STC')) {
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
                                h189.paramsGenerator_ = i189;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(f189, {
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
    RightPanel(t182 = null) {
        this.observeComponentCreation2((a189, b189) => {
            Column.create();
            Column.width(this.rightPanelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: { left: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        {
            this.observeComponentCreation2((w188, x188) => {
                if (x188) {
                    let y188 = new ProteusPanelTitle(this, {
                        title: { "id": 83886113, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        collapsed: false,
                        onToggle: () => { this.rightCollapsed = true; this.uiState.rightCollapsed = true; }
                    }, undefined, w188, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1635, col: 7 });
                    ViewPU.create(y188);
                    let z188 = () => {
                        return {
                            title: { "id": 83886113, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                            collapsed: false,
                            onToggle: () => { this.rightCollapsed = true; this.uiState.rightCollapsed = true; }
                        };
                    };
                    y188.paramsGenerator_ = z188;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(w188, {
                        title: { "id": 83886113, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        collapsed: false
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((u188, v188) => {
            Row.create();
            Row.layoutWeight(1);
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((i184, j184) => {
            If.create();
            if (this.activeRightTab === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((s188, t188) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((o188, p188) => {
                            if (p188) {
                                let q188 = new PropertyPanel(this, {
                                    selectedComponentId: this.selectedComponentId,
                                    docVersion: this.canvasVersion,
                                    simWaveTick: this.simWaveTick,
                                    statusMessage: this.__statusMessage,
                                    onDeleted: () => {
                                        this.selectedComponentId = '';
                                        this.selectedCount = 0;
                                        this.bumpCanvas();
                                    }
                                }, undefined, o188, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1643, col: 11 });
                                ViewPU.create(q188);
                                let r188 = () => {
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
                                q188.paramsGenerator_ = r188;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(o188, {
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
                    this.observeComponentCreation2((m188, n188) => {
                        __Common__.create();
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((i188, j188) => {
                            if (j188) {
                                let k188 = new InstrumentPanel(this, {
                                    statusMessage: this.__statusMessage,
                                    selectedComponentId: this.selectedComponentId,
                                    simWaveTick: this.simWaveTick
                                }, undefined, i188, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1657, col: 11 });
                                ViewPU.create(k188);
                                let l188 = () => {
                                    return {
                                        statusMessage: this.statusMessage,
                                        selectedComponentId: this.selectedComponentId,
                                        simWaveTick: this.simWaveTick
                                    };
                                };
                                k188.paramsGenerator_ = l188;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(i188, {
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
                    this.observeComponentCreation2((g188, h188) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.scrollBar(BarState.Auto);
                    }, Scroll);
                    this.observeComponentCreation2((e188, f188) => {
                        Column.create();
                        Column.width('100%');
                    }, Column);
                    this.observeComponentCreation2((k184, l184) => {
                        If.create();
                        if (this.activeRightTab === 1) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((c188, d188) => {
                                    Column.create({ space: 8 });
                                    Column.width('100%');
                                    Column.alignItems(HorizontalAlign.Start);
                                    Column.padding({ bottom: 8 });
                                }, Column);
                                {
                                    this.observeComponentCreation2((y187, z187) => {
                                        if (z187) {
                                            let a188 = new ProteusSectionTitle(this, { title: '仿真控制' }, undefined, y187, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1669, col: 19 });
                                            ViewPU.create(a188);
                                            let b188 = () => {
                                                return {
                                                    title: '仿真控制'
                                                };
                                            };
                                            a188.paramsGenerator_ = b188;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(y187, {
                                                title: '仿真控制'
                                            });
                                        }
                                    }, { name: "ProteusSectionTitle" });
                                }
                                this.observeComponentCreation2((w187, x187) => {
                                    Column.create();
                                    Column.alignItems(HorizontalAlign.Start);
                                    Column.width('100%');
                                    Column.padding({ left: 8 });
                                }, Column);
                                this.observeComponentCreation2((u187, v187) => {
                                    Text.create('仿真状态');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.margin({ bottom: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((s187, t187) => {
                                    Text.create(this.simRunning ? (this.simPaused ? '已暂停' : '运行中') : '空闲');
                                    Text.fontSize(ProteusFonts.TITLE);
                                    Text.fontColor(this.simRunning ? (this.simPaused ? ProteusColors.ERC_WARN : ProteusColors.ERC_OK) : ProteusColors.TEXT_SECONDARY);
                                    Text.fontWeight(FontWeight.Medium);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((o187, p187) => {
                                    If.create();
                                    if (this.simRunning) {
                                        this.ifElseBranchUpdateFunction(0, () => {
                                            this.observeComponentCreation2((q187, r187) => {
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
                                this.observeComponentCreation2((m187, n187) => {
                                    Row.create({ space: 8 });
                                    Row.width('100%');
                                    Row.padding({ left: 8, right: 8 });
                                    Row.justifyContent(FlexAlign.SpaceBetween);
                                }, Row);
                                {
                                    this.observeComponentCreation2((i187, j187) => {
                                        if (j187) {
                                            let k187 = new ProteusClassicBtn(this, {
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
                                            }, undefined, i187, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1692, col: 21 });
                                            ViewPU.create(k187);
                                            let l187 = () => {
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
                                            k187.paramsGenerator_ = l187;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(i187, {
                                                label: this.simRunning ? { "id": 83886134, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" } : { "id": 83886133, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: this.simRunning ? '停止仿真' : '运行仿真',
                                                widthVal: '42%'
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                                {
                                    this.observeComponentCreation2((e187, f187) => {
                                        if (f187) {
                                            let g187 = new ProteusClassicBtn(this, {
                                                label: { "id": 83886132, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: '暂停/恢复仿真',
                                                widthVal: '42%',
                                                onAction: () => { this.toggleSimPause(); }
                                            }, undefined, e187, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1705, col: 21 });
                                            ViewPU.create(g187);
                                            let h187 = () => {
                                                return {
                                                    label: { "id": 83886132, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                    tooltip: '暂停/恢复仿真',
                                                    widthVal: '42%',
                                                    onAction: () => { this.toggleSimPause(); }
                                                };
                                            };
                                            g187.paramsGenerator_ = h187;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(e187, {
                                                label: { "id": 83886132, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: '暂停/恢复仿真',
                                                widthVal: '42%'
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                                Row.pop();
                                this.observeComponentCreation2((c187, d187) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 4 });
                                }, Divider);
                                this.observeComponentCreation2((a187, b187) => {
                                    Text.create('ERC 检查');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.width('100%');
                                    Text.padding({ left: 8, top: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((y186, z186) => {
                                    Row.create();
                                    Row.width('100%');
                                    Row.padding({ left: 8 });
                                    Row.alignItems(VerticalAlign.Center);
                                }, Row);
                                this.observeComponentCreation2((w186, x186) => {
                                    Text.create('错误数:');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((u186, v186) => {
                                    Text.create(`${this.ercCount}`);
                                    Text.fontSize(ProteusFonts.TITLE);
                                    Text.fontColor(this.ercCount > 0 ? ProteusColors.ERC_ERR : ProteusColors.ERC_OK);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.margin({ left: 4 });
                                }, Text);
                                Text.pop();
                                Row.pop();
                                this.observeComponentCreation2((s186, t186) => {
                                    __Common__.create();
                                    __Common__.margin({ left: 8 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((i186, j186) => {
                                        if (j186) {
                                            let k186 = new ProteusClassicBtn(this, {
                                                label: '运行 ERC 检查',
                                                widthVal: '86%',
                                                onAction: () => {
                                                    const p186 = this.appService.runErc(false);
                                                    this.ercErrors = p186;
                                                    const q186 = p186.filter(r186 => r186.severity === 'error' || r186.severity === 'critical').length;
                                                    this.ercCount = p186.length;
                                                    this.navTab = 3;
                                                    this.statusMessage = `ERC: ${p186.length} issues (${q186} errors)`;
                                                }
                                            }, undefined, i186, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1739, col: 19 });
                                            ViewPU.create(k186);
                                            let l186 = () => {
                                                return {
                                                    label: '运行 ERC 检查',
                                                    widthVal: '86%',
                                                    onAction: () => {
                                                        const m186 = this.appService.runErc(false);
                                                        this.ercErrors = m186;
                                                        const n186 = m186.filter(o186 => o186.severity === 'error' || o186.severity === 'critical').length;
                                                        this.ercCount = m186.length;
                                                        this.navTab = 3;
                                                        this.statusMessage = `ERC: ${m186.length} issues (${n186} errors)`;
                                                    }
                                                };
                                            };
                                            k186.paramsGenerator_ = l186;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(i186, {
                                                label: '运行 ERC 检查',
                                                widthVal: '86%'
                                            });
                                        }
                                    }, { name: "ProteusClassicBtn" });
                                }
                                __Common__.pop();
                                this.observeComponentCreation2((g186, h186) => {
                                    Divider.create();
                                    Divider.color(ProteusColors.DIVIDER);
                                    Divider.height(1);
                                    Divider.width('100%');
                                    Divider.margin({ top: 4 });
                                }, Divider);
                                this.observeComponentCreation2((e186, f186) => {
                                    Text.create('电路统计');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.fontWeight(FontWeight.Medium);
                                    Text.width('100%');
                                    Text.padding({ left: 8, top: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((c186, d186) => {
                                    Column.create({ space: 4 });
                                    Column.alignItems(HorizontalAlign.Start);
                                    Column.width('100%');
                                    Column.padding({ left: 8 });
                                }, Column);
                                this.observeComponentCreation2((a186, b186) => {
                                    Row.create();
                                }, Row);
                                this.observeComponentCreation2((y185, z185) => {
                                    Text.create('器件:');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.width(48);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((w185, x185) => {
                                    Text.create(`${this.getDocComponents().length}`);
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                }, Text);
                                Text.pop();
                                Row.pop();
                                this.observeComponentCreation2((u185, v185) => {
                                    Row.create();
                                }, Row);
                                this.observeComponentCreation2((s185, t185) => {
                                    Text.create('网络:');
                                    Text.fontSize(ProteusFonts.PARAM_KEY);
                                    Text.fontColor(ProteusColors.TEXT_LABEL);
                                    Text.width(48);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((q185, r185) => {
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
                                this.observeComponentCreation2((o185, p185) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 280 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((k185, l185) => {
                                        if (l185) {
                                            let m185 = new AiSettingsPanel(this, { statusMessage: this.__statusMessage }, undefined, k185, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1790, col: 17 });
                                            ViewPU.create(m185);
                                            let n185 = () => {
                                                return {
                                                    statusMessage: this.statusMessage
                                                };
                                            };
                                            m185.paramsGenerator_ = n185;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(k185, {});
                                        }
                                    }, { name: "AiSettingsPanel" });
                                }
                                __Common__.pop();
                            });
                        }
                        else if (this.activeRightTab === 3) {
                            this.ifElseBranchUpdateFunction(2, () => {
                                this.observeComponentCreation2((i185, j185) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 320 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((e185, f185) => {
                                        if (f185) {
                                            let g185 = new McuDebugPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, e185, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1793, col: 17 });
                                            ViewPU.create(g185);
                                            let h185 = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    selectedComponentId: this.selectedComponentId
                                                };
                                            };
                                            g185.paramsGenerator_ = h185;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(e185, {
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
                                this.observeComponentCreation2((c185, d185) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 240 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((y184, z184) => {
                                        if (z184) {
                                            let a185 = new FaultInjectionPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, y184, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1799, col: 17 });
                                            ViewPU.create(a185);
                                            let b185 = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    selectedComponentId: this.selectedComponentId
                                                };
                                            };
                                            a185.paramsGenerator_ = b185;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(y184, {
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
                                this.observeComponentCreation2((w184, x184) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 240 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((s184, t184) => {
                                        if (t184) {
                                            let u184 = new TeachingPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, s184, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1805, col: 17 });
                                            ViewPU.create(u184);
                                            let v184 = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    selectedComponentId: this.selectedComponentId
                                                };
                                            };
                                            u184.paramsGenerator_ = v184;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(s184, {
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
                                this.observeComponentCreation2((q184, r184) => {
                                    __Common__.create();
                                    __Common__.constraintSize({ minHeight: 320 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((m184, n184) => {
                                        if (n184) {
                                            let o184 = new PlatformSettingsPanel(this, { statusMessage: this.__statusMessage, themeRefreshKey: this.__themeRefreshKey }, undefined, m184, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1811, col: 17 });
                                            ViewPU.create(o184);
                                            let p184 = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    themeRefreshKey: this.themeRefreshKey
                                                };
                                            };
                                            o184.paramsGenerator_ = p184;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(m184, {});
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
        this.observeComponentCreation2((g184, h184) => {
            Column.create();
            Column.width(44);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            Column.border({ width: { left: 1 }, color: ProteusColors.SIDEBAR_TAB_BORDER });
        }, Column);
        {
            this.observeComponentCreation2((c184, d184) => {
                if (d184) {
                    let e184 = new ProteusSidebarTab(this, {
                        label: '属性', tooltip: '属性面板', icon: ProteusIconName.SETTINGS,
                        selected: this.activeRightTab === 0,
                        onSelect: () => { this.setActiveRightTab(0); }
                    }, undefined, c184, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1823, col: 11 });
                    ViewPU.create(e184);
                    let f184 = () => {
                        return {
                            label: '属性',
                            tooltip: '属性面板',
                            icon: ProteusIconName.SETTINGS,
                            selected: this.activeRightTab === 0,
                            onSelect: () => { this.setActiveRightTab(0); }
                        };
                    };
                    e184.paramsGenerator_ = f184;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(c184, {
                        label: '属性', tooltip: '属性面板', icon: ProteusIconName.SETTINGS,
                        selected: this.activeRightTab === 0
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((y183, z183) => {
                if (z183) {
                    let a184 = new ProteusSidebarTab(this, {
                        label: '仿真', tooltip: '仿真控制', icon: ProteusIconName.PLAY,
                        selected: this.activeRightTab === 1,
                        onSelect: () => { this.setActiveRightTab(1); }
                    }, undefined, y183, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1828, col: 11 });
                    ViewPU.create(a184);
                    let b184 = () => {
                        return {
                            label: '仿真',
                            tooltip: '仿真控制',
                            icon: ProteusIconName.PLAY,
                            selected: this.activeRightTab === 1,
                            onSelect: () => { this.setActiveRightTab(1); }
                        };
                    };
                    a184.paramsGenerator_ = b184;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(y183, {
                        label: '仿真', tooltip: '仿真控制', icon: ProteusIconName.PLAY,
                        selected: this.activeRightTab === 1
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((u183, v183) => {
                if (v183) {
                    let w183 = new ProteusSidebarTab(this, {
                        label: 'AI', tooltip: 'AI 助手', icon: ProteusIconName.AI_ROUTE,
                        selected: this.activeRightTab === 2,
                        onSelect: () => { this.setActiveRightTab(2); }
                    }, undefined, u183, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1833, col: 11 });
                    ViewPU.create(w183);
                    let x183 = () => {
                        return {
                            label: 'AI',
                            tooltip: 'AI 助手',
                            icon: ProteusIconName.AI_ROUTE,
                            selected: this.activeRightTab === 2,
                            onSelect: () => { this.setActiveRightTab(2); }
                        };
                    };
                    w183.paramsGenerator_ = x183;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(u183, {
                        label: 'AI', tooltip: 'AI 助手', icon: ProteusIconName.AI_ROUTE,
                        selected: this.activeRightTab === 2
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        this.observeComponentCreation2((s183, t183) => {
            Stack.create();
        }, Stack);
        {
            this.observeComponentCreation2((o183, p183) => {
                if (p183) {
                    let q183 = new ProteusSidebarTab(this, {
                        label: '调试', tooltip: 'MCU 调试', icon: ProteusIconName.COMPONENT,
                        selected: this.activeRightTab === 3,
                        onSelect: () => { this.setActiveRightTab(3); }
                    }, undefined, o183, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1839, col: 13 });
                    ViewPU.create(q183);
                    let r183 = () => {
                        return {
                            label: '调试',
                            tooltip: 'MCU 调试',
                            icon: ProteusIconName.COMPONENT,
                            selected: this.activeRightTab === 3,
                            onSelect: () => { this.setActiveRightTab(3); }
                        };
                    };
                    q183.paramsGenerator_ = r183;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(o183, {
                        label: '调试', tooltip: 'MCU 调试', icon: ProteusIconName.COMPONENT,
                        selected: this.activeRightTab === 3
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        this.observeComponentCreation2((k183, l183) => {
            If.create();
            if (this.debugTabHasBadge) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((m183, n183) => {
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
            this.observeComponentCreation2((g183, h183) => {
                if (h183) {
                    let i183 = new ProteusSidebarTab(this, {
                        label: '仪器', tooltip: '虚拟仪器', icon: ProteusIconName.ZOOM_IN,
                        selected: this.activeRightTab === 4,
                        onSelect: () => { this.setActiveRightTab(4); }
                    }, undefined, g183, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1851, col: 11 });
                    ViewPU.create(i183);
                    let j183 = () => {
                        return {
                            label: '仪器',
                            tooltip: '虚拟仪器',
                            icon: ProteusIconName.ZOOM_IN,
                            selected: this.activeRightTab === 4,
                            onSelect: () => { this.setActiveRightTab(4); }
                        };
                    };
                    i183.paramsGenerator_ = j183;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g183, {
                        label: '仪器', tooltip: '虚拟仪器', icon: ProteusIconName.ZOOM_IN,
                        selected: this.activeRightTab === 4
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((c183, d183) => {
                if (d183) {
                    let e183 = new ProteusSidebarTab(this, {
                        label: '故障', tooltip: '故障注入', icon: ProteusIconName.WARNING,
                        selected: this.activeRightTab === 5,
                        onSelect: () => { this.setActiveRightTab(5); }
                    }, undefined, c183, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1856, col: 11 });
                    ViewPU.create(e183);
                    let f183 = () => {
                        return {
                            label: '故障',
                            tooltip: '故障注入',
                            icon: ProteusIconName.WARNING,
                            selected: this.activeRightTab === 5,
                            onSelect: () => { this.setActiveRightTab(5); }
                        };
                    };
                    e183.paramsGenerator_ = f183;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(c183, {
                        label: '故障', tooltip: '故障注入', icon: ProteusIconName.WARNING,
                        selected: this.activeRightTab === 5
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((y182, z182) => {
                if (z182) {
                    let a183 = new ProteusSidebarTab(this, {
                        label: '教学', tooltip: '教学助手', icon: ProteusIconName.LABEL,
                        selected: this.activeRightTab === 6,
                        onSelect: () => { this.setActiveRightTab(6); }
                    }, undefined, y182, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1861, col: 11 });
                    ViewPU.create(a183);
                    let b183 = () => {
                        return {
                            label: '教学',
                            tooltip: '教学助手',
                            icon: ProteusIconName.LABEL,
                            selected: this.activeRightTab === 6,
                            onSelect: () => { this.setActiveRightTab(6); }
                        };
                    };
                    a183.paramsGenerator_ = b183;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(y182, {
                        label: '教学', tooltip: '教学助手', icon: ProteusIconName.LABEL,
                        selected: this.activeRightTab === 6
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        {
            this.observeComponentCreation2((u182, v182) => {
                if (v182) {
                    let w182 = new ProteusSidebarTab(this, {
                        label: '设置', tooltip: '平台设置', icon: ProteusIconName.GRID,
                        selected: this.activeRightTab === 7,
                        onSelect: () => { this.setActiveRightTab(7); }
                    }, undefined, u182, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1866, col: 11 });
                    ViewPU.create(w182);
                    let x182 = () => {
                        return {
                            label: '设置',
                            tooltip: '平台设置',
                            icon: ProteusIconName.GRID,
                            selected: this.activeRightTab === 7,
                            onSelect: () => { this.setActiveRightTab(7); }
                        };
                    };
                    w182.paramsGenerator_ = x182;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(u182, {
                        label: '设置', tooltip: '平台设置', icon: ProteusIconName.GRID,
                        selected: this.activeRightTab === 7
                    });
                }
            }, { name: "ProteusSidebarTab" });
        }
        Column.pop();
        Row.pop();
        Column.pop();
    }
    WelcomeDialog(y181 = null) {
        this.observeComponentCreation2((r182, s182) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000080');
        }, Column);
        this.observeComponentCreation2((p182, q182) => {
            Column.create();
            Column.width(340);
            Column.padding(24);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 12, color: '#00000060' });
        }, Column);
        this.observeComponentCreation2((n182, o182) => {
            Text.create('欢迎使用 AI 原理图仿真');
            Text.fontSize(18);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Bold);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((l182, m182) => {
            Text.create('请先新建工程或打开已有工程');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((j182, k182) => {
            Text.create(`工程目录: ${this.userProjectDir}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 16 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((h182, i182) => {
            Row.create({ space: 12 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((d182, e182) => {
                if (e182) {
                    let f182 = new ProteusClassicBtn(this, {
                        label: '新建工程',
                        widthVal: '48%',
                        onAction: () => { this.handleNewProject(); }
                    }, undefined, d182, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1906, col: 11 });
                    ViewPU.create(f182);
                    let g182 = () => {
                        return {
                            label: '新建工程',
                            widthVal: '48%',
                            onAction: () => { this.handleNewProject(); }
                        };
                    };
                    f182.paramsGenerator_ = g182;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(d182, {
                        label: '新建工程',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((z181, a182) => {
                if (a182) {
                    let b182 = new ProteusClassicBtn(this, {
                        label: '打开工程',
                        widthVal: '48%',
                        onAction: () => { void this.handleOpenProject(); }
                    }, undefined, z181, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1911, col: 11 });
                    ViewPU.create(b182);
                    let c182 = () => {
                        return {
                            label: '打开工程',
                            widthVal: '48%',
                            onAction: () => { void this.handleOpenProject(); }
                        };
                    };
                    b182.paramsGenerator_ = c182;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(z181, {
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
    NewProjectDialog(a181 = null) {
        this.observeComponentCreation2((w181, x181) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showNewProjectDialog = false; });
        }, Column);
        this.observeComponentCreation2((u181, v181) => {
            Column.create();
            Column.width(340);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((s181, t181) => {
            Text.create('新建工程');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((q181, r181) => {
            Text.create('请输入工程名称（保存至 project 目录）');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((o181, p181) => {
            Text.create(this.userProjectDir);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((l181, m181) => {
            TextInput.create({ placeholder: 'MyProject', text: this.newProjectNameInput });
            TextInput.width('100%');
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((n181: string) => { this.newProjectNameInput = n181; });
            TextInput.onSubmit(() => { this.doCreateNewProject(); });
        }, TextInput);
        this.observeComponentCreation2((j181, k181) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((f181, g181) => {
                if (g181) {
                    let h181 = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '48%',
                        onAction: () => {
                            this.showNewProjectDialog = false;
                            this.showWelcomeDialog = true;
                        }
                    }, undefined, f181, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1962, col: 11 });
                    ViewPU.create(h181);
                    let i181 = () => {
                        return {
                            label: '取消',
                            widthVal: '48%',
                            onAction: () => {
                                this.showNewProjectDialog = false;
                                this.showWelcomeDialog = true;
                            }
                        };
                    };
                    h181.paramsGenerator_ = i181;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(f181, {
                        label: '取消',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((b181, c181) => {
                if (c181) {
                    let d181 = new ProteusClassicBtn(this, {
                        label: '创建',
                        widthVal: '48%',
                        onAction: () => { this.doCreateNewProject(); }
                    }, undefined, b181, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1970, col: 11 });
                    ViewPU.create(d181);
                    let e181 = () => {
                        return {
                            label: '创建',
                            widthVal: '48%',
                            onAction: () => { this.doCreateNewProject(); }
                        };
                    };
                    d181.paramsGenerator_ = e181;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(b181, {
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
    RecoveryDialog(h179 = null) {
        this.observeComponentCreation2((y180, z180) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
        }, Column);
        this.observeComponentCreation2((w180, x180) => {
            Column.create();
            Column.width(380);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((u180, v180) => {
            Text.create('检测到未正常关闭的工程');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.ERC_WARN);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((s180, t180) => {
            Text.create('上次软件未正常关闭，以下工程可尝试恢复');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 12 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((q180, r180) => {
            List.create({ space: 4 });
            List.height(80);
            List.width('100%');
            List.margin({ bottom: 12 });
        }, List);
        this.observeComponentCreation2((w179, x179) => {
            ForEach.create();
            const y179 = (a180, b180: number) => {
                const c180 = a180;
                {
                    const d180 = (o180, p180) => {
                        ViewStackProcessor.StartGetAccessRecordingFor(o180);
                        ListItem.create(f180, true);
                        if (!p180) {
                            ListItem.pop();
                        }
                        ViewStackProcessor.StopGetAccessRecording();
                    };
                    const e180 = (m180, n180) => {
                        ListItem.create(f180, true);
                    };
                    const f180 = (g180, h180) => {
                        d180(g180, h180);
                        this.observeComponentCreation2((k180, l180) => {
                            Row.create();
                            Row.width('100%');
                            Row.padding(8);
                            Row.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        }, Row);
                        this.observeComponentCreation2((i180, j180) => {
                            Text.create(c180);
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
                    this.observeComponentCreation2(e180, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(w179, this.recoveryFiles, y179, (z179: string) => z179, true, false);
        }, ForEach);
        ForEach.pop();
        List.pop();
        this.observeComponentCreation2((u179, v179) => {
            Row.create({ space: 8 });
            Row.width('100%');
        }, Row);
        {
            this.observeComponentCreation2((q179, r179) => {
                if (r179) {
                    let s179 = new ProteusClassicBtn(this, {
                        label: '忽略',
                        widthVal: '32%',
                        onAction: () => {
                            this.showRecoveryDialog = false;
                            this.showWelcomeDialog = true;
                        }
                    }, undefined, q179, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2030, col: 11 });
                    ViewPU.create(s179);
                    let t179 = () => {
                        return {
                            label: '忽略',
                            widthVal: '32%',
                            onAction: () => {
                                this.showRecoveryDialog = false;
                                this.showWelcomeDialog = true;
                            }
                        };
                    };
                    s179.paramsGenerator_ = t179;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q179, {
                        label: '忽略',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((m179, n179) => {
                if (n179) {
                    let o179 = new ProteusClassicBtn(this, {
                        label: '恢复最新',
                        widthVal: '32%',
                        onAction: () => {
                            void this.doRecoverLatest();
                        }
                    }, undefined, m179, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2038, col: 11 });
                    ViewPU.create(o179);
                    let p179 = () => {
                        return {
                            label: '恢复最新',
                            widthVal: '32%',
                            onAction: () => {
                                void this.doRecoverLatest();
                            }
                        };
                    };
                    o179.paramsGenerator_ = p179;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(m179, {
                        label: '恢复最新',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((i179, j179) => {
                if (j179) {
                    let k179 = new ProteusClassicBtn(this, {
                        label: '新建工程',
                        widthVal: '32%',
                        onAction: () => {
                            this.showRecoveryDialog = false;
                            this.handleNewProject();
                        }
                    }, undefined, i179, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2045, col: 11 });
                    ViewPU.create(k179);
                    let l179 = () => {
                        return {
                            label: '新建工程',
                            widthVal: '32%',
                            onAction: () => {
                                this.showRecoveryDialog = false;
                                this.handleNewProject();
                            }
                        };
                    };
                    k179.paramsGenerator_ = l179;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i179, {
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
        const e179 = this.recoveryFiles[this.recoveryFiles.length - 1];
        const f179 = await this.appService.loadProject(e179);
        if (f179) {
            this.projectName = this.appService.currentProject?.name ?? 'Recovered';
            const g179 = this.projectName;
            this.appService.disableAutoSave();
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${g179}.schsim`, 120000);
            this.resetAfterProjectChange();
            this.appService.schematicEditor.fitAllInView();
            this.refreshComponentList();
            this.showRecoveryDialog = false;
            this.statusMessage = `已恢复工程: ${g179}`;
        }
        else {
            this.statusMessage = '恢复失败，请尝试手动打开';
        }
    }
    FileOpenDialog(c178 = null) {
        this.observeComponentCreation2((c179, d179) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showOpenDialog = false; });
        }, Column);
        this.observeComponentCreation2((a179, b179) => {
            Column.create();
            Column.width(320);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((y178, z178) => {
            Text.create('打开工程文件');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((w178, x178) => {
            Text.create('请输入 .schsim 工程文件路径（默认在应用沙箱 project 目录）');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u178, v178) => {
            Text.create(this.userProjectDir);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((r178, s178) => {
            TextInput.create({ placeholder: `${this.userProjectDir}/MyProject.schsim`, text: this.openFilePath });
            TextInput.width('100%');
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((t178: string) => { this.openFilePath = t178; });
        }, TextInput);
        this.observeComponentCreation2((p178, q178) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((l178, m178) => {
                if (m178) {
                    let n178 = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '32%',
                        onAction: () => { this.showOpenDialog = false; }
                    }, undefined, l178, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2117, col: 11 });
                    ViewPU.create(n178);
                    let o178 = () => {
                        return {
                            label: '取消',
                            widthVal: '32%',
                            onAction: () => { this.showOpenDialog = false; }
                        };
                    };
                    n178.paramsGenerator_ = o178;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(l178, {
                        label: '取消',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((h178, i178) => {
                if (i178) {
                    let j178 = new ProteusClassicBtn(this, {
                        label: '浏览',
                        widthVal: '32%',
                        onAction: () => { void this.handleOpenFromPicker(); }
                    }, undefined, h178, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2122, col: 11 });
                    ViewPU.create(j178);
                    let k178 = () => {
                        return {
                            label: '浏览',
                            widthVal: '32%',
                            onAction: () => { void this.handleOpenFromPicker(); }
                        };
                    };
                    j178.paramsGenerator_ = k178;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(h178, {
                        label: '浏览',
                        widthVal: '32%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((d178, e178) => {
                if (e178) {
                    let f178 = new ProteusClassicBtn(this, {
                        label: '打开',
                        widthVal: '32%',
                        onAction: () => { void this.doOpenFromPath(); }
                    }, undefined, d178, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2127, col: 11 });
                    ViewPU.create(f178);
                    let g178 = () => {
                        return {
                            label: '打开',
                            widthVal: '32%',
                            onAction: () => { void this.doOpenFromPath(); }
                        };
                    };
                    f178.paramsGenerator_ = g178;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(d178, {
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
    FileSaveAsDialog(e177 = null) {
        this.observeComponentCreation2((a178, b178) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showSaveAsDialog = false; });
        }, Column);
        this.observeComponentCreation2((y177, z177) => {
            Column.create();
            Column.width(320);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((w177, x177) => {
            Text.create('另存为');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u177, v177) => {
            Text.create('请输入保存路径（默认在应用沙箱 project 目录）');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((s177, t177) => {
            Text.create(this.userProjectDir);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(2);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((p177, q177) => {
            TextInput.create({ placeholder: `${this.userProjectDir}/${this.projectName}.schsim`, text: this.saveAsPath });
            TextInput.width('100%');
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((r177: string) => { this.saveAsPath = r177; });
        }, TextInput);
        this.observeComponentCreation2((n177, o177) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((j177, k177) => {
                if (k177) {
                    let l177 = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '48%',
                        onAction: () => { this.showSaveAsDialog = false; }
                    }, undefined, j177, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2178, col: 11 });
                    ViewPU.create(l177);
                    let m177 = () => {
                        return {
                            label: '取消',
                            widthVal: '48%',
                            onAction: () => { this.showSaveAsDialog = false; }
                        };
                    };
                    l177.paramsGenerator_ = m177;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j177, {
                        label: '取消',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((f177, g177) => {
                if (g177) {
                    let h177 = new ProteusClassicBtn(this, {
                        label: '保存',
                        widthVal: '48%',
                        onAction: () => { void this.doSaveAsFromPath(); }
                    }, undefined, f177, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2183, col: 11 });
                    ViewPU.create(h177);
                    let i177 = () => {
                        return {
                            label: '保存',
                            widthVal: '48%',
                            onAction: () => { void this.doSaveAsFromPath(); }
                        };
                    };
                    h177.paramsGenerator_ = i177;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(f177, {
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
    BurnHexDialog(b175 = null) {
        this.observeComponentCreation2((c177, d177) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showBurnDialog = false; });
        }, Column);
        this.observeComponentCreation2((a177, b177) => {
            Column.create();
            Column.width(380);
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((y176, z176) => {
            Text.create(`烧录 HEX 到 MCU`);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((w176, x176) => {
            Text.create('选择编译生成的 .hex 文件烧录到当前选中的 MCU');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u176, v176) => {
            Row.create();
            Row.width('100%');
            Row.margin({ bottom: 6 });
        }, Row);
        this.observeComponentCreation2((s176, t176) => {
            Text.create('目标架构:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(64);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((o176, p176) => {
                if (p176) {
                    let q176 = new ProteusClassicBtn(this, {
                        label: '8051',
                        widthVal: 52,
                        onAction: () => { this.burnMcuFamily = '8051'; }
                    }, undefined, o176, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2226, col: 11 });
                    ViewPU.create(q176);
                    let r176 = () => {
                        return {
                            label: '8051',
                            widthVal: 52,
                            onAction: () => { this.burnMcuFamily = '8051'; }
                        };
                    };
                    q176.paramsGenerator_ = r176;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(o176, {
                        label: '8051',
                        widthVal: 52
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((k176, l176) => {
                if (l176) {
                    let m176 = new ProteusClassicBtn(this, {
                        label: 'STM32',
                        widthVal: 52,
                        onAction: () => { this.burnMcuFamily = 'STM32'; }
                    }, undefined, k176, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2231, col: 11 });
                    ViewPU.create(m176);
                    let n176 = () => {
                        return {
                            label: 'STM32',
                            widthVal: 52,
                            onAction: () => { this.burnMcuFamily = 'STM32'; }
                        };
                    };
                    m176.paramsGenerator_ = n176;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(k176, {
                        label: 'STM32',
                        widthVal: 52
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((i176, j176) => {
            Text.create(`当前: ${this.burnMcuFamily === '8051' ? '8051' : 'STM32F1'}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.ERC_OK);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ left: 4 });
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((g176, h176) => {
            Row.create();
            Row.width('100%');
            Row.margin({ bottom: 6 });
        }, Row);
        this.observeComponentCreation2((d176, e176) => {
            TextInput.create({ placeholder: '/path/to/firmware.hex', text: this.burnFilePath });
            TextInput.layoutWeight(1);
            TextInput.height(32);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((f176: string) => { this.burnFilePath = f176; });
        }, TextInput);
        {
            this.observeComponentCreation2((z175, a176) => {
                if (a176) {
                    let b176 = new ProteusClassicBtn(this, {
                        label: '浏览',
                        widthVal: 60,
                        onAction: () => { void this.doBrowseHexFile(); }
                    }, undefined, z175, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2256, col: 11 });
                    ViewPU.create(b176);
                    let c176 = () => {
                        return {
                            label: '浏览',
                            widthVal: 60,
                            onAction: () => { void this.doBrowseHexFile(); }
                        };
                    };
                    b176.paramsGenerator_ = c176;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(z175, {
                        label: '浏览',
                        widthVal: 60
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((x175, y175) => {
            Row.create();
            Row.width('100%');
            Row.margin({ bottom: 6 });
        }, Row);
        this.observeComponentCreation2((v175, w175) => {
            Text.create('入口地址:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(64);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((s175, t175) => {
            TextInput.create({ text: this.burnEntryPoint, placeholder: '0x0000' });
            TextInput.layoutWeight(1);
            TextInput.height(28);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.fontFamily('monospace');
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((u175: string) => { this.burnEntryPoint = u175; });
        }, TextInput);
        Row.pop();
        this.observeComponentCreation2((m175, n175) => {
            If.create();
            if (this.burnFirmwareInfo.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((q175, r175) => {
                        Column.create();
                        Column.width('100%');
                        Column.margin({ bottom: 8 });
                    }, Column);
                    this.observeComponentCreation2((o175, p175) => {
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
        this.observeComponentCreation2((k175, l175) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 4 });
        }, Row);
        {
            this.observeComponentCreation2((g175, h175) => {
                if (h175) {
                    let i175 = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '48%',
                        onAction: () => {
                            this.showBurnDialog = false;
                            this.burnFirmwareInfo = '';
                        }
                    }, undefined, g175, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2303, col: 11 });
                    ViewPU.create(i175);
                    let j175 = () => {
                        return {
                            label: '取消',
                            widthVal: '48%',
                            onAction: () => {
                                this.showBurnDialog = false;
                                this.burnFirmwareInfo = '';
                            }
                        };
                    };
                    i175.paramsGenerator_ = j175;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g175, {
                        label: '取消',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((c175, d175) => {
                if (d175) {
                    let e175 = new ProteusClassicBtn(this, {
                        label: '烧录',
                        widthVal: '48%',
                        onAction: () => { void this.doBurnHex(); }
                    }, undefined, c175, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2311, col: 11 });
                    ViewPU.create(e175);
                    let f175 = () => {
                        return {
                            label: '烧录',
                            widthVal: '48%',
                            onAction: () => { void this.doBurnHex(); }
                        };
                    };
                    e175.paramsGenerator_ = f175;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(c175, {
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
    ExitConfirmDialog(e174 = null) {
        this.observeComponentCreation2((z174, a175) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showExitConfirmDialog = false; });
        }, Column);
        this.observeComponentCreation2((x174, y174) => {
            Column.create();
            Column.width(380);
            Column.padding(24);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((v174, w174) => {
            Text.create('未保存的更改');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t174, u174) => {
            Text.create('当前工程有未保存的更改，是否保存？');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 16 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((r174, s174) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((n174, o174) => {
                if (o174) {
                    let p174 = new ProteusClassicBtn(this, {
                        label: '取消',
                        widthVal: '30%',
                        onAction: () => { this.showExitConfirmDialog = false; }
                    }, undefined, n174, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2349, col: 11 });
                    ViewPU.create(p174);
                    let q174 = () => {
                        return {
                            label: '取消',
                            widthVal: '30%',
                            onAction: () => { this.showExitConfirmDialog = false; }
                        };
                    };
                    p174.paramsGenerator_ = q174;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n174, {
                        label: '取消',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((j174, k174) => {
                if (k174) {
                    let l174 = new ProteusClassicBtn(this, {
                        label: '不保存',
                        widthVal: '30%',
                        onAction: () => {
                            this.unsavedChanges = false;
                            this.showExitConfirmDialog = false;
                            void this.appService.saveSession(this.appService.currentProjectPath, this.projectName, true);
                        }
                    }, undefined, j174, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2354, col: 11 });
                    ViewPU.create(l174);
                    let m174 = () => {
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
                    l174.paramsGenerator_ = m174;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j174, {
                        label: '不保存',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((f174, g174) => {
                if (g174) {
                    let h174 = new ProteusClassicBtn(this, {
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
                    }, undefined, f174, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2363, col: 11 });
                    ViewPU.create(h174);
                    let i174 = () => {
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
                    h174.paramsGenerator_ = i174;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(f174, {
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
    StatusBar(v172 = null) {
        this.observeComponentCreation2((c174, d174) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.STATUS_HEIGHT);
            Row.padding({ left: 8, right: 8 });
            Row.backgroundColor(ProteusColors.STATUS_BAR_BG);
            Row.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((a174, b174) => {
            Text.create(`[${toolModeLabel(this.toolMode)}]`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((y173, z173) => {
            Text.create(`X:${this.mouseX} Y:${this.mouseY}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((w173, x173) => {
            Text.create(`Grid:${this.appService.schematicEditor.getViewport().gridSize}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u173, v173) => {
            Text.create(`Sel:${this.selectedCount}`);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(this.selectedCount > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((q173, r173) => {
                if (r173) {
                    let s173 = new ProteusVDivider(this, {}, undefined, q173, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2414, col: 7 });
                    ViewPU.create(s173);
                    let t173 = () => {
                        return {};
                    };
                    s173.paramsGenerator_ = t173;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(q173, {});
                }
            }, { name: "ProteusVDivider" });
        }
        this.observeComponentCreation2((o173, p173) => {
            Text.create(this.statusMessage);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.layoutWeight(1);
            Text.margin({ left: 8, right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((k173, l173) => {
            If.create();
            if (this.aiProgress > 0 && this.aiProgress < 100) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((m173, n173) => {
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
            this.observeComponentCreation2((g173, h173) => {
                if (h173) {
                    let i173 = new ProteusVDivider(this, {}, undefined, g173, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2431, col: 7 });
                    ViewPU.create(i173);
                    let j173 = () => {
                        return {};
                    };
                    i173.paramsGenerator_ = j173;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g173, {});
                }
            }, { name: "ProteusVDivider" });
        }
        this.observeComponentCreation2((a173, b173) => {
            If.create();
            if (this.ercCount === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((e173, f173) => {
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
                    this.observeComponentCreation2((c173, d173) => {
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
        this.observeComponentCreation2((y172, z172) => {
            Text.create(this.simRunning ? (this.simPaused ? 'Sim:Paused' : 'Sim:Running') : 'Sim:Idle');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(this.simRunning ? ProteusColors.ERC_OK : ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((w172, x172) => {
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
