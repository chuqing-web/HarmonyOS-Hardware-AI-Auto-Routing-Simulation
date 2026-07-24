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
    rightPanelRefreshKey?: number;
    selectedComponentId?: string;
    searchKeyword?: string;
    componentList?: string[];
    ercCount?: number;
    ercErrors?: ErcError[];
    aiProgress?: number;
    aiStage?: string;
    aiGenerating?: boolean;
    mouseX?: number;
    mouseY?: number;
    zoomPercent?: number;
    gridVisible?: boolean;
    warEnabled?: boolean;
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
    libRefreshKey?: number;
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
    showSimFailDialog?: boolean;
    showInstrWaveExpand?: boolean;
    instrWaveExpandTick?: number;
    simFailMessage?: string;
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
import { InstrTraceLogPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/InstrTraceLogPanel";
import { InstrumentWaveExpandOverlay } from "@bundle:com.elecdraw.aischsim/entry/ets/components/InstrumentWaveExpandOverlay";
import { InstrumentWaveExpandStore, INSTR_WAVE_EXPAND_OPEN_KEY, INSTR_WAVE_EXPAND_TICK_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/components/InstrumentWaveExpandStore";
import { ComponentPreview } from "@bundle:com.elecdraw.aischsim/entry/ets/components/ComponentPreview";
import { ProteusVDivider, ProteusPanelTitle, ProteusNavTab, ProteusTreeRow, ProteusClassicBtn, ProteusSectionTitle, ProteusMenuTrigger, ProteusToolButton, ProteusToolGroup, ProteusResizer, ProteusSidebarTab, ProteusNavCompRow, ProteusNavNetRow, ProteusErcRow, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import type { ProteusMenuEntry } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { UiStateStore } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/UiStateStore";
import { CallbackRegistry, ComponentCategory, EventBus, ModuleEvent, McuFamily, isInstrumentLibraryId, traceBurn, formatFirmwarePreview, appVersionLabel, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ErcError, ProgressInfo, ComponentInstance, SchematicDocument, ModuleEventPayload } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicEditorImpl, AlignType } from 'schematic_editor';
import type { SimulationKernelImpl } from 'simulation_kernel';
import { EditorToolMode, toolModeLabel } from "@bundle:com.elecdraw.aischsim/entry/ets/model/EditorToolMode";
import { AppViewModel } from "@bundle:com.elecdraw.aischsim/entry/ets/viewmodel/AppViewModel";
import type common from "@ohos:app.ability.common";
import window from "@ohos:window";
import picker from "@ohos:file.picker";
import fileUri from "@ohos:file.fileuri";
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
        this.__rightPanelRefreshKey = new ObservedPropertySimplePU(0, this, "rightPanelRefreshKey");
        this.__selectedComponentId = new ObservedPropertySimplePU('', this, "selectedComponentId");
        this.__searchKeyword = new ObservedPropertySimplePU('', this, "searchKeyword");
        this.__componentList = new ObservedPropertyObjectPU([], this, "componentList");
        this.__ercCount = new ObservedPropertySimplePU(0, this, "ercCount");
        this.__ercErrors = new ObservedPropertyObjectPU([], this, "ercErrors");
        this.__aiProgress = new ObservedPropertySimplePU(0, this, "aiProgress");
        this.__aiStage = new ObservedPropertySimplePU('', this, "aiStage");
        this.__aiGenerating = new ObservedPropertySimplePU(false, this, "aiGenerating");
        this.__mouseX = new ObservedPropertySimplePU(0, this, "mouseX");
        this.__mouseY = new ObservedPropertySimplePU(0, this, "mouseY");
        this.__zoomPercent = new ObservedPropertySimplePU(100, this, "zoomPercent");
        this.__gridVisible = new ObservedPropertySimplePU(true, this, "gridVisible");
        this.__warEnabled = new ObservedPropertySimplePU(true, this, "warEnabled");
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
        this.__libRefreshKey = new ObservedPropertySimplePU(0, this, "libRefreshKey");
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
        this.__showSimFailDialog = new ObservedPropertySimplePU(false, this, "showSimFailDialog");
        this.__showInstrWaveExpand = this.createStorageLink(INSTR_WAVE_EXPAND_OPEN_KEY, false, "showInstrWaveExpand");
        this.__instrWaveExpandTick = this.createStorageLink(INSTR_WAVE_EXPAND_TICK_KEY, 0, "instrWaveExpandTick");
        this.__simFailMessage = new ObservedPropertySimplePU('', this, "simFailMessage");
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
        this.declareWatch("themeRefreshKey", this.onThemeRefresh);
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
        if (params.rightPanelRefreshKey !== undefined) {
            this.rightPanelRefreshKey = params.rightPanelRefreshKey;
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
        if (params.aiGenerating !== undefined) {
            this.aiGenerating = params.aiGenerating;
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
        if (params.warEnabled !== undefined) {
            this.warEnabled = params.warEnabled;
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
        if (params.libRefreshKey !== undefined) {
            this.libRefreshKey = params.libRefreshKey;
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
        if (params.showSimFailDialog !== undefined) {
            this.showSimFailDialog = params.showSimFailDialog;
        }
        if (params.simFailMessage !== undefined) {
            this.simFailMessage = params.simFailMessage;
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
        this.__rightPanelRefreshKey.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__searchKeyword.purgeDependencyOnElmtId(rmElmtId);
        this.__componentList.purgeDependencyOnElmtId(rmElmtId);
        this.__ercCount.purgeDependencyOnElmtId(rmElmtId);
        this.__ercErrors.purgeDependencyOnElmtId(rmElmtId);
        this.__aiProgress.purgeDependencyOnElmtId(rmElmtId);
        this.__aiStage.purgeDependencyOnElmtId(rmElmtId);
        this.__aiGenerating.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseX.purgeDependencyOnElmtId(rmElmtId);
        this.__mouseY.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomPercent.purgeDependencyOnElmtId(rmElmtId);
        this.__gridVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__warEnabled.purgeDependencyOnElmtId(rmElmtId);
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
        this.__libRefreshKey.purgeDependencyOnElmtId(rmElmtId);
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
        this.__showSimFailDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__showInstrWaveExpand.purgeDependencyOnElmtId(rmElmtId);
        this.__instrWaveExpandTick.purgeDependencyOnElmtId(rmElmtId);
        this.__simFailMessage.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__projectName.aboutToBeDeleted();
        this.__simRunning.aboutToBeDeleted();
        this.__simPaused.aboutToBeDeleted();
        this.__simWaveTick.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__canvasVersion.aboutToBeDeleted();
        this.__rightPanelRefreshKey.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__searchKeyword.aboutToBeDeleted();
        this.__componentList.aboutToBeDeleted();
        this.__ercCount.aboutToBeDeleted();
        this.__ercErrors.aboutToBeDeleted();
        this.__aiProgress.aboutToBeDeleted();
        this.__aiStage.aboutToBeDeleted();
        this.__aiGenerating.aboutToBeDeleted();
        this.__mouseX.aboutToBeDeleted();
        this.__mouseY.aboutToBeDeleted();
        this.__zoomPercent.aboutToBeDeleted();
        this.__gridVisible.aboutToBeDeleted();
        this.__warEnabled.aboutToBeDeleted();
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
        this.__libRefreshKey.aboutToBeDeleted();
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
        this.__showSimFailDialog.aboutToBeDeleted();
        this.__showInstrWaveExpand.aboutToBeDeleted();
        this.__instrWaveExpandTick.aboutToBeDeleted();
        this.__simFailMessage.aboutToBeDeleted();
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
    /** 工程切换时递增，强制右侧栏面板 remount */
    private __rightPanelRefreshKey: ObservedPropertySimplePU<number>;
    get rightPanelRefreshKey() {
        return this.__rightPanelRefreshKey.get();
    }
    set rightPanelRefreshKey(newValue: number) {
        this.__rightPanelRefreshKey.set(newValue);
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
    private __aiGenerating: ObservedPropertySimplePU<boolean>;
    get aiGenerating() {
        return this.__aiGenerating.get();
    }
    set aiGenerating(newValue: boolean) {
        this.__aiGenerating.set(newValue);
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
    private __warEnabled: ObservedPropertySimplePU<boolean>;
    get warEnabled() {
        return this.__warEnabled.get();
    }
    set warEnabled(newValue: boolean) {
        this.__warEnabled.set(newValue);
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
    private __libRefreshKey: ObservedPropertySimplePU<number>;
    get libRefreshKey() {
        return this.__libRefreshKey.get();
    }
    set libRefreshKey(newValue: number) {
        this.__libRefreshKey.set(newValue);
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
    private __showSimFailDialog: ObservedPropertySimplePU<boolean>;
    get showSimFailDialog() {
        return this.__showSimFailDialog.get();
    }
    set showSimFailDialog(newValue: boolean) {
        this.__showSimFailDialog.set(newValue);
    }
    private __showInstrWaveExpand: ObservedPropertyAbstractPU<boolean>;
    get showInstrWaveExpand() {
        return this.__showInstrWaveExpand.get();
    }
    set showInstrWaveExpand(newValue: boolean) {
        this.__showInstrWaveExpand.set(newValue);
    }
    private __instrWaveExpandTick: ObservedPropertyAbstractPU<number>;
    get instrWaveExpandTick() {
        return this.__instrWaveExpandTick.get();
    }
    set instrWaveExpandTick(newValue: number) {
        this.__instrWaveExpandTick.set(newValue);
    }
    private __simFailMessage: ObservedPropertySimplePU<string>;
    get simFailMessage() {
        return this.__simFailMessage.get();
    }
    set simFailMessage(newValue: string) {
        this.__simFailMessage.set(newValue);
    }
    private clipboardLibId: string;
    private clipboardDeviceIds: string[];
    private userProjectDir: string;
    private modifierKeys: number;
    private appService: AppService;
    private vm: AppViewModel;
    private uiState: UiStateStore;
    async aboutToAppear(): Promise<void> {
        InstrumentWaveExpandStore.ensureAppStorage();
        Logger.info(INSTR_TRACE_TAG, `[APP] START ver=${appVersionLabel()}`);
        const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
        this.appService.initPlatform(ctx);
        this.userProjectDir = this.appService.getUserProjectDir();
        this.warEnabled = this.getEditorImpl().isWarEnabled();
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
        this.appService.onAiGeneratingChanged = (busy: boolean) => {
            this.aiGenerating = busy;
            if (busy) {
                this.setActiveRightTab(2);
                this.rightCollapsed = false;
                this.uiState.rightCollapsed = false;
                this.previewComponentId = '';
                this.toolMode = EditorToolMode.SELECT;
                this.wireStartActive = false;
            }
            this.bumpCanvas();
        };
        this.appService.onProjectChanged = () => {
            this.refreshUiAfterProjectChange();
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
        // 平台设置（主题/缩放）已在 initPlatform 落地，触发一次 UI 重绘
        this.themeRefreshKey++;
        this.getEditorImpl().setGridVisible(this.gridVisible);
        this.initCategoryTree();
        this.appService.onLibraryLoaded = (_total: number) => {
            this.initCategoryTree();
            this.libRefreshKey++;
            if (this.searchKeyword.trim().length > 0) {
                this.refreshComponentList();
            }
        };
        this.hookStartupWindowResize();
        // Splash 阶段已最大化；此处再确认一次（幂等），并拉长启动期 refit 窗口
        void maximizeAppWindow(ctx).then(() => {
            this.startupRefitDeadline = Date.now() + 5000;
            this.deferCanvasFit();
        });
        // 先读 recovery/session（仍保留上次 closedCleanly），再标记本次运行中
        this.recoveryFiles = await this.appService.checkRecoveryFiles();
        const session = await this.appService.loadSession();
        if (session !== null && session.lastProjectName.length > 0) {
            const autoSavePath = session.autoSavePath !== undefined && session.autoSavePath.length > 0
                ? session.autoSavePath
                : `${this.appService.getAutosaveDir()}/${session.lastProjectName}.schsim`;
            const pathsToTry: string[] = [];
            if (!session.closedCleanly) {
                for (let i = 0; i < this.recoveryFiles.length; i++) {
                    if (!pathsToTry.includes(this.recoveryFiles[i])) {
                        pathsToTry.push(this.recoveryFiles[i]);
                    }
                }
                if (session.lastPath.length > 0 && !pathsToTry.includes(session.lastPath)) {
                    pathsToTry.push(session.lastPath);
                }
                if (!pathsToTry.includes(autoSavePath)) {
                    pathsToTry.push(autoSavePath);
                }
            }
            else {
                if (session.lastPath.length > 0) {
                    pathsToTry.push(session.lastPath);
                }
                if (!pathsToTry.includes(autoSavePath)) {
                    pathsToTry.push(autoSavePath);
                }
            }
            let ok = false;
            let loadedPath = '';
            for (let i = 0; i < pathsToTry.length; i++) {
                ok = await this.appService.loadProject(pathsToTry[i]);
                if (ok) {
                    loadedPath = pathsToTry[i];
                    break;
                }
            }
            if (ok) {
                this.projectName = this.appService.currentProject?.name ?? session.lastProjectName;
                this.appService.enableAutoSave(autoSavePath, AppService.AUTOSAVE_INTERVAL_MS);
                this.deferCanvasFit();
                this.appInitialized = true;
                if (!session.closedCleanly) {
                    const loadedFromWorkingCopy = loadedPath === autoSavePath ||
                        this.recoveryFiles.includes(loadedPath);
                    if (!loadedFromWorkingCopy && this.recoveryFiles.length > 0) {
                        this.showRecoveryDialog = true;
                        this.statusMessage = `已恢复工程: ${this.projectName}（检测到更新的工作副本）`;
                    }
                    else {
                        this.statusMessage = `已从工作副本恢复: ${loadedPath}`;
                    }
                }
                else if (this.recoveryFiles.length > 0) {
                    this.showRecoveryDialog = true;
                    this.statusMessage = `已恢复工程: ${this.projectName}（检测到额外恢复文件）`;
                }
                else {
                    this.statusMessage = `已恢复上次工程: ${this.projectName}`;
                }
                await this.appService.markSessionRunning();
                return;
            }
        }
        if (this.recoveryFiles.length > 0) {
            this.appService.newProject('Untitled');
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/Untitled.schsim`, AppService.AUTOSAVE_INTERVAL_MS);
            this.showRecoveryDialog = true;
            this.appInitialized = true;
            this.statusMessage = '检测到未正常关闭的工程，是否恢复？';
            await this.appService.markSessionRunning();
            return;
        }
        // No recovery, no last session — show welcome dialog
        this.appService.newProject('Untitled');
        this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/Untitled.schsim`, AppService.AUTOSAVE_INTERVAL_MS);
        this.refreshComponentList();
        this.deferCanvasFit();
        this.appInitialized = true;
        this.showWelcomeDialog = true;
        this.statusMessage = '欢迎使用 AI 原理图仿真 — 请新建或打开工程';
        await this.appService.markSessionRunning();
    }
    onPageHide(): void {
        void this.appService.flushProjectProtection(false);
    }
    aboutToDisappear(): void {
        void this.appService.flushProjectProtection(!this.unsavedChanges);
    }
    onBackPress(): boolean {
        if (this.unsavedChanges) {
            this.showExitConfirmDialog = true;
            return true;
        }
        void this.appService.flushProjectProtection(true);
        return false;
    }
    onThemeRefresh(): void {
        // 主题/无障碍变更后重绘画布（网格色、导线色、背景、符号描边）
        this.canvasVersion++;
        this.navRefreshKey++;
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
    /** 仿真中可点击/拖动的交互器件 — 操作时不应切换右侧栏 */
    private isInteractiveSimComponent(libraryId: string): boolean {
        const lib = libraryId.toUpperCase();
        return lib === 'SW_PUSH' || lib.includes('SWITCH_PUSH') || lib === 'BUTTON' ||
            lib.startsWith('POT_') || lib.includes('POTENTIOMETER') || lib === 'POT' || lib.includes('_POT');
    }
    updateContextualTabs(instUuid: string): void {
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === instUuid);
        if (!comp)
            return;
        const lib = comp.libraryId.toUpperCase();
        const isMcu = lib.startsWith('STM32') || lib.startsWith('8051') || lib.startsWith('AT89') ||
            lib.startsWith('STC') || lib.startsWith('AVR');
        const isInstr = isInstrumentLibraryId(comp.libraryId);
        this.debugTabHasBadge = isMcu;
        this.instrTabHasBadge = isInstr;
        // 仿真中点击开关/电位器等交互器件时，保持当前右侧面板不变
        if (this.simRunning && this.isInteractiveSimComponent(comp.libraryId)) {
            return;
        }
        // 选中器件时展开右侧栏并跳到对应面板：MCU→调试、仪器→Instr、其余→属性
        if (this.rightCollapsed) {
            this.rightCollapsed = false;
            this.uiState.rightCollapsed = false;
        }
        if (isMcu) {
            this.setActiveRightTab(3);
        }
        else if (isInstr) {
            this.setActiveRightTab(4);
        }
        else {
            this.setActiveRightTab(0);
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
            const count = this.appService.componentLibrary.listAllByCategory(cat).length;
            const base = labels.get(cat) ?? cat;
            nodes.push({
                cat: cat,
                label: count > 0 ? `${base} (${count})` : base,
                expanded: false
            });
            if (i === 0) {
                expanded.add(cat);
            }
        }
        this.categoryNodes = nodes;
        // Preserve already-expanded categories across library reload
        if (this.expandedCategories.size > 0) {
            const keep = new Set<ComponentCategory>();
            this.expandedCategories.forEach((c: ComponentCategory) => {
                if (cats.indexOf(c) >= 0) {
                    keep.add(c);
                }
            });
            if (keep.size > 0) {
                this.expandedCategories = keep;
                return;
            }
        }
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
            // 拉全部分页结果，避免库很大时只显示前 50 条
            const pageSize = 200;
            let page = 1;
            const rows: string[] = [];
            let total = 0;
            while (true) {
                const result = this.appService.componentLibrary.search(kw, page, pageSize);
                total = result.total;
                for (let i = 0; i < result.items.length; i++) {
                    const c = result.items[i];
                    rows.push(`${c.id}|${c.name}`);
                }
                if (rows.length >= total || result.items.length === 0) {
                    break;
                }
                page++;
                if (page > 50) {
                    break;
                }
            }
            this.componentList = rows;
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
    /**
     * Wait until canvas reports real size, then fit.
     * applyFitRect 在尺寸未就绪时会直接 return，故需重试；稳定后再补一次纠正半窗缩放。
     */
    private deferCanvasFit(attempt: number = 0): void {
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        if (editor.isCanvasViewReady()) {
            editor.fitAllInView();
            this.bumpCanvas();
            // 布局可能仍在收敛：短延迟再 fit 一次，消除偶发“局部软放大”
            if (attempt === 0 || attempt === 4) {
                setTimeout(() => {
                    if (editor.isCanvasViewReady()) {
                        editor.fitAllInView();
                        this.bumpCanvas();
                    }
                }, attempt === 0 ? 120 : 280);
            }
            return;
        }
        if (attempt < 50) {
            setTimeout(() => this.deferCanvasFit(attempt + 1), 50);
        }
    }
    private hookStartupWindowResize(): void {
        if (this.windowResizeHooked) {
            return;
        }
        this.windowResizeHooked = true;
        this.startupRefitDeadline = Date.now() + 6000;
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
        this.hookStartupWindowResize();
        this.startupRefitDeadline = Date.now() + 6000;
        this.deferCanvasFit();
    }
    /** 新建/打开/切换工程后同步右侧栏与仿真 UI 状态 */
    private refreshUiAfterProjectChange(): void {
        this.projectName = this.appService.currentProject?.name ?? 'Untitled';
        const kernel = this.appService.simulationKernel as SimulationKernelImpl;
        if (kernel.isSimActive()) {
            this.appService.stopSimulation();
        }
        this.simRunning = false;
        this.simPaused = false;
        this.resetAfterProjectChange();
        this.refreshComponentList();
        // Defer ERC — template insert used to block MMI 3s+ with sync DeepErc + log flood
        this.appService.scheduleRuntimeErc(80);
    }
    private async startSimFromUi(): Promise<void> {
        const ok = await this.appService.startSimulation();
        this.applySimStartResult(ok);
        if (ok) {
            this.simPaused = false;
        }
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
        this.debugTabHasBadge = false;
        this.instrTabHasBadge = false;
        this.rightPanelRefreshKey++;
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
            return;
        }
        const reason = this.appService.getLastSimStartFailReason();
        this.simFailMessage = reason.length > 0 ? reason : '仿真启动失败，请检查电路连接后重试';
        this.showSimFailDialog = true;
    }
    setToolMode(mode: EditorToolMode, pendingId: string = ''): void {
        if (this.aiGenerating) {
            this.statusMessage = 'AI 生成中，画布已锁定';
            return;
        }
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
        else if (mode === EditorToolMode.LABEL) {
            this.statusMessage = '网络标签：点击画布输入网络名；选择模式下双击标号可改名';
        }
        else if (mode === EditorToolMode.WIRE) {
            this.statusMessage = '连线：点引脚开始 → 点空白加拐点 → 再点同一拐点放端点（可右击加标号）/ 或点另一引脚完成';
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
    /** 将沙箱 project 目录转为系统文件选择器可用的 URI */
    private getProjectDirUri(): string {
        if (this.userProjectDir.length === 0) {
            this.userProjectDir = this.appService.getUserProjectDir();
        }
        try {
            fs.accessSync(this.userProjectDir);
        }
        catch (_e) {
            try {
                fs.mkdirSync(this.userProjectDir, true);
            }
            catch (_e2) { /* */ }
        }
        try {
            return fileUri.getUriFromPath(this.userProjectDir);
        }
        catch (_e) {
            return '';
        }
    }
    private getHostAbilityContext(): common.UIAbilityContext {
        return this.getUIContext().getHostContext() as common.UIAbilityContext;
    }
    /** 从 file:// / content:// / 本地路径提取工程名 */
    private projectNameFromPath(pathOrUri: string): string {
        let s = pathOrUri;
        const q = s.indexOf('?');
        if (q >= 0) {
            s = s.substring(0, q);
        }
        const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        let name = slash >= 0 ? s.substring(slash + 1) : s;
        try {
            name = decodeURIComponent(name);
        }
        catch (_e) { /* keep */ }
        const lower = name.toLowerCase();
        if (lower.endsWith('.schsim')) {
            name = name.substring(0, name.length - 7);
        }
        else if (lower.endsWith('.json')) {
            name = name.substring(0, name.length - 5);
        }
        name = name.replace(/[\\/:*?"<>|]/g, '_').trim();
        return name.length > 0 ? name : 'Untitled';
    }
    private applyOpenedProject(path: string): void {
        this.projectName = this.appService.currentProject?.name ?? this.projectNameFromPath(path);
        const name = this.projectName;
        this.appService.disableAutoSave();
        this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`, AppService.AUTOSAVE_INTERVAL_MS);
        this.appService.schematicEditor.fitAllInView();
        this.unsavedChanges = false;
        void this.appService.saveSession(path, name, false);
        this.statusMessage = `已加载: ${path}`;
    }
    /**
     * 新建：直接打开系统文件管理（默认定位到 project 目录）另存为新工程
     */
    async handleNewProject(): Promise<void> {
        this.showWelcomeDialog = false;
        this.showOpenDialog = false;
        this.showSaveAsDialog = false;
        this.showNewProjectDialog = false;
        const result = await this.createProjectViaPicker();
        if (result === 'unavailable') {
            // 选择器不可用时，回退到名称对话框（仍写入 project 目录）
            this.newProjectNameInput = '';
            this.showNewProjectDialog = true;
        }
    }
    /** 通过系统保存对话框在 project 目录创建工程 */
    private async createProjectViaPicker(): Promise<'ok' | 'cancel' | 'unavailable'> {
        try {
            const options = new picker.DocumentSaveOptions();
            options.newFileNames = ['Untitled.schsim'];
            options.fileSuffixChoices = ['原理图工程|.schsim', 'JSON|.json'];
            const dirUri = this.getProjectDirUri();
            if (dirUri.length > 0) {
                options.defaultFilePathUri = dirUri;
            }
            const docPicker = new picker.DocumentViewPicker(this.getHostAbilityContext());
            const uris = await docPicker.save(options);
            if (!uris || uris.length === 0) {
                return 'cancel';
            }
            const path = uris[0];
            const name = this.projectNameFromPath(path);
            this.appService.disableAutoSave();
            this.appService.newProject(name);
            this.projectName = name;
            this.appService.schematicEditor.fitAllInView();
            const ok = await this.appService.saveProject(path, true);
            if (ok) {
                const autoSavePath = `${this.appService.getAutosaveDir()}/${name}.schsim`;
                this.appService.enableAutoSave(autoSavePath, AppService.AUTOSAVE_INTERVAL_MS);
                void this.appService.saveProject(autoSavePath, false);
                await this.appService.saveSession(path, name, false);
                this.unsavedChanges = false;
                this.statusMessage = `已创建: ${path}`;
            }
            else {
                this.statusMessage = '创建失败：无法写入所选位置';
            }
            return 'ok';
        }
        catch (_e) {
            return 'unavailable';
        }
    }
    doCreateNewProject(): void {
        let name = this.newProjectNameInput.trim().length > 0 ? this.newProjectNameInput.trim() : 'Untitled';
        // 禁止路径分隔符，避免跳出 project 目录
        name = name.replace(/[\\/:*?"<>|]/g, '_');
        if (name.length === 0) {
            name = 'Untitled';
        }
        this.showNewProjectDialog = false;
        this.showWelcomeDialog = false;
        this.appService.disableAutoSave();
        this.appService.newProject(name);
        this.projectName = name;
        this.appService.schematicEditor.fitAllInView();
        const projectPath = `${this.userProjectDir}/${name}.schsim`;
        const autoSavePath = `${this.appService.getAutosaveDir()}/${name}.schsim`;
        this.appService.currentProjectPath = projectPath;
        void this.appService.saveProject(projectPath, true).then((saved) => {
            if (saved) {
                this.appService.currentProjectPath = projectPath;
                this.unsavedChanges = false;
                this.statusMessage = `已创建: ${projectPath}`;
                void this.appService.saveSession(projectPath, name, false);
            }
            else {
                this.statusMessage = `创建失败，请检查工程目录: ${this.userProjectDir}`;
            }
        });
        this.appService.enableAutoSave(autoSavePath, AppService.AUTOSAVE_INTERVAL_MS);
    }
    /**
     * 打开：直接打开系统文件管理（默认定位到 project 目录）
     */
    async handleOpenProject(): Promise<void> {
        this.showWelcomeDialog = false;
        this.showSaveAsDialog = false;
        const result = await this.handleOpenFromPicker();
        if (result === 'unavailable') {
            // 选择器不可用时回退到路径对话框
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
        }
    }
    /** @returns ok=已选择并处理；cancel=用户取消；unavailable=选择器不可用 */
    async handleOpenFromPicker(): Promise<'ok' | 'cancel' | 'unavailable'> {
        try {
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = 1;
            options.fileSuffixFilters = ['原理图工程|.schsim,.json', '.schsim', '.json'];
            const dirUri = this.getProjectDirUri();
            if (dirUri.length > 0) {
                options.defaultFilePathUri = dirUri;
            }
            const docPicker = new picker.DocumentViewPicker(this.getHostAbilityContext());
            const uris = await docPicker.select(options);
            if (uris && uris.length > 0) {
                const ok = await this.appService.loadProject(uris[0]);
                if (ok) {
                    this.showOpenDialog = false;
                    this.showWelcomeDialog = false;
                    this.applyOpenedProject(uris[0]);
                    return 'ok';
                }
                this.statusMessage = `无法打开: ${uris[0]}`;
                return 'ok';
            }
            return 'cancel';
        }
        catch (_e) {
            this.statusMessage = '文件选择器不可用';
            return 'unavailable';
        }
    }
    async doOpenFromPath(): Promise<void> {
        if (this.openFilePath.trim().length === 0) {
            this.statusMessage = '请输入文件路径';
            return;
        }
        const path = this.openFilePath.trim();
        const ok = await this.appService.loadProject(path);
        if (ok) {
            this.showOpenDialog = false;
            this.showWelcomeDialog = false;
            this.applyOpenedProject(path);
        }
        else {
            this.statusMessage = `无法打开: ${path}`;
        }
    }
    async handleSaveProject(): Promise<void> {
        const path = this.appService.currentProjectPath;
        if (path.length > 0) {
            const ok = await this.appService.saveProject(path, true);
            if (ok) {
                // 同步 autosave 副本，不得改写正式路径
                const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
                void this.appService.saveProject(autoPath, false);
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
            options.fileSuffixChoices = ['原理图工程|.schsim', 'JSON|.json'];
            const dirUri = this.getProjectDirUri();
            if (dirUri.length > 0) {
                options.defaultFilePathUri = dirUri;
            }
            const docPicker = new picker.DocumentViewPicker(this.getHostAbilityContext());
            const uris = await docPicker.save(options);
            if (uris && uris.length > 0) {
                const ok = await this.appService.saveProject(uris[0], true);
                if (ok) {
                    const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
                    void this.appService.saveProject(autoPath, false);
                    await this.appService.saveSession(uris[0], this.projectName, false);
                    this.unsavedChanges = false;
                }
                this.statusMessage = ok ? `已保存: ${uris[0]}` : '保存失败';
                return;
            }
            return;
        }
        catch (_e) {
            // File picker not available, show manual dialog
        }
        this.saveAsPath = `${this.userProjectDir}/${this.projectName}.schsim`;
        this.showSaveAsDialog = true;
        this.showOpenDialog = false;
    }
    async doSaveAsFromPath(): Promise<void> {
        if (this.saveAsPath.trim().length === 0) {
            this.statusMessage = '请输入保存路径';
            return;
        }
        const path = this.saveAsPath.trim();
        const ok = await this.appService.saveProject(path, true);
        if (ok) {
            this.showSaveAsDialog = false;
            const autoPath = `${this.appService.getAutosaveDir()}/${this.projectName}.schsim`;
            void this.appService.saveProject(autoPath, false);
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
        const editor = this.appService.schematicEditor as SchematicEditorImpl;
        const selectedWireIds = editor.getSelectedWireIds();
        if (selectedDevices.length > 0) {
            const ids: string[] = [];
            for (let i = 0; i < selectedDevices.length; i++) {
                ids.push(selectedDevices[i].instUuid);
            }
            this.appService.schematicEditor.batchDeleteDevice(ids);
        }
        if (selectedWireIds.length > 0) {
            this.appService.schematicEditor.clearSelectedRoute();
        }
        if (selectedDevices.length === 0 && selectedWireIds.length === 0) {
            this.statusMessage = '未选中任何对象';
            return;
        }
        this.selectedComponentId = '';
        this.selectedCount = 0;
        this.selectedWireActive = false;
        this.bumpCanvas();
        this.statusMessage = selectedWireIds.length > 0 && selectedDevices.length === 0
            ? `已删除 ${selectedWireIds.length} 根导线`
            : '已删除';
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
        if (this.appService.rejectManualPlaceIfAiBusy()) {
            return;
        }
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
        if (this.appService.rejectManualPlaceIfAiBusy()) {
            return;
        }
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
    toggleWar(): void {
        this.warEnabled = !this.warEnabled;
        this.getEditorImpl().setWarEnabled(this.warEnabled);
        this.statusMessage = this.warEnabled
            ? 'WAR 已开启：连线自动避让器件/引脚/导线（预览=落线）'
            : 'WAR 已关闭：仅正交折线，不自动寻路';
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
            Column.key(`main_shell_${this.themeRefreshKey}`);
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
            // Left edge peel when whole left dock is collapsed — was invisible before
            if (this.leftLibCollapsed && this.leftNavCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.LeftExpandStrip.bind(this)();
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
                                let componentCall = new ProteusResizer(this, { side: 'left', onDrag: (d: number) => this.onLeftPanelResize(d) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1171, col: 13 });
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
                                let componentCall = new ProteusResizer(this, { side: 'right', onDrag: (d: number) => this.onRightPanelResize(d) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1175, col: 13 });
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
                    this.RightExpandStrip.bind(this)();
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showSimFailDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.SimFailDialog.bind(this)();
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
            if (this.showInstrWaveExpand) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new InstrumentWaveExpandOverlay(this, {
                                    refreshTick: this.instrWaveExpandTick,
                                    onClose: () => {
                                        InstrumentWaveExpandStore.getInstance().close();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1220, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        refreshTick: this.instrWaveExpandTick,
                                        onClose: () => {
                                            InstrumentWaveExpandStore.getInstance().close();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    refreshTick: this.instrWaveExpandTick
                                });
                            }
                        }, { name: "InstrumentWaveExpandOverlay" });
                    }
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
                void this.startSimFromUi();
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
                this.appService.schematicEditor.zoomByFactor(1.2);
                this.bumpCanvas();
                return true;
            case '-':
                this.appService.schematicEditor.zoomByFactor(1 / 1.2);
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
            Row.key(`menu_bar_${this.themeRefreshKey}`);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusMenuTrigger(this, {
                        label: { "id": 83886094, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        entries: this.fileMenuEntries()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1305, col: 7 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1309, col: 7 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1313, col: 7 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1317, col: 7 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1321, col: 7 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1325, col: 7 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1329, col: 7 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1333, col: 7 });
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
            { label: { "id": 83886155, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+N', icon: ProteusIconName.NEW, action: () => { void this.handleNewProject(); } },
            { label: { "id": 83886156, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+O', icon: ProteusIconName.OPEN, action: () => { void this.handleOpenProject(); } },
            { label: { "id": 83886162, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } },
            { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => { void this.handleSaveAs(); } },
            { label: '', separator: true, action: () => { } },
            { label: 'Export...', action: () => { this.statusMessage = 'Export: not yet implemented'; } }
        ];
    }
    editMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886166, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+Z', icon: ProteusIconName.UNDO, action: () => {
                    const r = this.appService.schematicEditor.undo();
                    this.statusMessage = r.success ? 'Undone' : 'Nothing to undo';
                    this.bumpCanvas();
                } },
            { label: { "id": 83886160, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+Y', icon: ProteusIconName.REDO, action: () => {
                    const r = this.appService.schematicEditor.redo();
                    this.statusMessage = r.success ? 'Redone' : 'Nothing to redo';
                    this.bumpCanvas();
                } },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886146, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+C', icon: ProteusIconName.COPY, action: () => this.handleCopy() },
            { label: { "id": 83886157, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+V', icon: ProteusIconName.PASTE, action: () => this.handlePaste() },
            { label: 'Delete', shortcut: 'Del', icon: ProteusIconName.TRASH, action: () => this.handleDeleteSelected() }
        ];
    }
    viewMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886168, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: '+', icon: ProteusIconName.ZOOM_IN, action: () => {
                    this.appService.schematicEditor.zoomByFactor(1.2);
                    this.bumpCanvas();
                } },
            { label: { "id": 83886169, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: '-', icon: ProteusIconName.ZOOM_OUT, action: () => {
                    this.appService.schematicEditor.zoomByFactor(1 / 1.2);
                    this.bumpCanvas();
                } },
            { label: { "id": 83886150, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+0', icon: ProteusIconName.FIT, action: () => {
                    this.appService.schematicEditor.fitAllInView();
                    this.bumpCanvas();
                } },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886151, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'G', icon: ProteusIconName.GRID, action: () => this.toggleGrid() },
            { label: 'Toggle Ruler', shortcut: 'R', icon: ProteusIconName.RULER, action: () => this.toggleRuler() }
        ];
    }
    placeMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886158, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'P', icon: ProteusIconName.COMPONENT, action: () => this.setToolMode(EditorToolMode.PLACE) },
            { label: { "id": 83886167, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'W', icon: ProteusIconName.WIRE, action: () => this.setToolMode(EditorToolMode.WIRE) },
            { label: { "id": 83886178, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: '', icon: ProteusIconName.AI_ROUTE, action: () => this.toggleWar() },
            { label: { "id": 83886145, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'B', icon: ProteusIconName.BUS, action: () => this.setToolMode(EditorToolMode.BUS) },
            { label: { "id": 83886153, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'L', icon: ProteusIconName.LABEL, action: () => this.setToolMode(EditorToolMode.LABEL) },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886159, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Shift+P', icon: ProteusIconName.POWER, action: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') },
            { label: { "id": 83886152, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Shift+G', icon: ProteusIconName.GROUND, action: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }
        ];
    }
    simMenuEntries(): ProteusMenuEntry[] {
        return [
            { label: { "id": 83886164, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'F5', icon: ProteusIconName.PLAY, action: async () => {
                    if (this.simRunning) {
                        this.appService.stopSimulation();
                        this.simRunning = false;
                    }
                    else {
                        await this.startSimFromUi();
                    }
                } },
            { label: { "id": 83886163, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'F6', icon: ProteusIconName.PAUSE, action: () => {
                    this.toggleSimPause();
                } },
            { label: { "id": 83886165, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Shift+F5', icon: ProteusIconName.STOP, action: () => {
                    this.appService.stopSimulation();
                    this.simRunning = false;
                    this.simPaused = false;
                } },
            { label: '', separator: true, action: () => { } },
            { label: { "id": 83886149, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'F7', icon: ProteusIconName.ERC, action: () => {
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
            { label: { "id": 83886155, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+N', icon: ProteusIconName.NEW, action: () => { void this.handleNewProject(); } },
            { label: { "id": 83886156, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+O', icon: ProteusIconName.OPEN, action: () => { void this.handleOpenProject(); } },
            { label: { "id": 83886162, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, shortcut: 'Ctrl+S', icon: ProteusIconName.SAVE, action: () => { void this.handleSaveProject(); } }
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
            { label: 'About', action: () => {
                    this.statusMessage = `ElecDraw Schematic Editor ${appVersionLabel()}`;
                } }
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
            Row.key(`main_toolbar_${this.themeRefreshKey}`);
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1488, col: 9 });
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1489, col: 9 });
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1490, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1487, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'File',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.NEW, tooltip: '新建文件 (Ctrl+N)', showLabel: false, onAction: () => { void this.handleNewProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1488, col: 9 });
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
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.OPEN, tooltip: '打开文件 (Ctrl+O)', showLabel: false, onAction: () => { void this.handleOpenProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1489, col: 9 });
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
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.SAVE, tooltip: '保存文件 (Ctrl+S)', showLabel: false, onAction: () => { void this.handleSaveProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1490, col: 9 });
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1494, col: 9 });
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1499, col: 9 });
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
                                            onAction: () => this.handleDeleteSelected() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1504, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1493, col: 7 });
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1494, col: 9 });
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1499, col: 9 });
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
                                                onAction: () => this.handleDeleteSelected() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1504, col: 9 });
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
                                            disabled: this.selectedCount === 0, onAction: () => this.handleCopy() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1510, col: 9 });
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1512, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1509, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Edit',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.COPY, tooltip: '复制 (Ctrl+C)', showLabel: false,
                                                disabled: this.selectedCount === 0, onAction: () => this.handleCopy() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1510, col: 9 });
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
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.PASTE, tooltip: '粘贴 (Ctrl+V)', showLabel: false, onAction: () => this.handlePaste() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1512, col: 9 });
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
                                                this.appService.schematicEditor.zoomByFactor(1.2);
                                                this.bumpCanvas();
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1516, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ZOOM_IN,
                                                tooltip: '放大 (+)',
                                                showLabel: false,
                                                onAction: () => {
                                                    this.appService.schematicEditor.zoomByFactor(1.2);
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
                                                this.appService.schematicEditor.zoomByFactor(1 / 1.2);
                                                this.bumpCanvas();
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1520, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.ZOOM_OUT,
                                                tooltip: '缩小 (-)',
                                                showLabel: false,
                                                onAction: () => {
                                                    this.appService.schematicEditor.zoomByFactor(1 / 1.2);
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1524, col: 9 });
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
                                            active: this.gridVisible, onAction: () => this.toggleGrid() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1528, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1515, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'View',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ZOOM_IN, tooltip: '放大 (+)', showLabel: false, onAction: () => {
                                                    this.appService.schematicEditor.zoomByFactor(1.2);
                                                    this.bumpCanvas();
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1516, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ZOOM_IN,
                                                    tooltip: '放大 (+)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        this.appService.schematicEditor.zoomByFactor(1.2);
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
                                                    this.appService.schematicEditor.zoomByFactor(1 / 1.2);
                                                    this.bumpCanvas();
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1520, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.ZOOM_OUT,
                                                    tooltip: '缩小 (-)',
                                                    showLabel: false,
                                                    onAction: () => {
                                                        this.appService.schematicEditor.zoomByFactor(1 / 1.2);
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1524, col: 9 });
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
                                                active: this.gridVisible, onAction: () => this.toggleGrid() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1528, col: 9 });
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
                                            active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1533, col: 9 });
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
                                        let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.WIRE, tooltip: '连线 (W)：点引脚→加拐点→再点拐点放端点，或点另一引脚完成', showLabel: false,
                                            active: this.toolMode === EditorToolMode.WIRE,
                                            disabled: this.simRunning,
                                            onAction: () => this.setToolMode(EditorToolMode.WIRE) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1535, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.WIRE,
                                                tooltip: '连线 (W)：点引脚→加拐点→再点拐点放端点，或点另一引脚完成',
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
                                            iconName: ProteusIconName.WIRE, tooltip: '连线 (W)：点引脚→加拐点→再点拐点放端点，或点另一引脚完成', showLabel: false,
                                            active: this.toolMode === EditorToolMode.WIRE,
                                            disabled: this.simRunning
                                        });
                                    }
                                }, { name: "ProteusToolButton" });
                            }
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusToolButton(this, {
                                            iconName: ProteusIconName.AI_ROUTE,
                                            label: { "id": 83886178, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                            showLabel: true,
                                            tooltip: 'WAR 导线自动寻路（Proteus Wire Auto Router）：开=避让器件/引脚/导线，预览路径即落线路径',
                                            active: this.warEnabled,
                                            onAction: () => this.toggleWar()
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1539, col: 9 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                label: { "id": 83886178, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                showLabel: true,
                                                tooltip: 'WAR 导线自动寻路（Proteus Wire Auto Router）：开=避让器件/引脚/导线，预览路径即落线路径',
                                                active: this.warEnabled,
                                                onAction: () => this.toggleWar()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            iconName: ProteusIconName.AI_ROUTE,
                                            label: { "id": 83886178, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                            showLabel: true,
                                            tooltip: 'WAR 导线自动寻路（Proteus Wire Auto Router）：开=避让器件/引脚/导线，预览路径即落线路径',
                                            active: this.warEnabled
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
                                            onAction: () => this.setToolMode(EditorToolMode.BUS) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1547, col: 9 });
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
                                            active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1551, col: 9 });
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
                                            onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1553, col: 9 });
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
                                            onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1555, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1532, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Place',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.COMPONENT, tooltip: '放置器件 (P)', showLabel: false,
                                                active: this.toolMode === EditorToolMode.PLACE, onAction: () => this.setToolMode(EditorToolMode.PLACE, this.previewComponentId) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1533, col: 9 });
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
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.WIRE, tooltip: '连线 (W)：点引脚→加拐点→再点拐点放端点，或点另一引脚完成', showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning,
                                                onAction: () => this.setToolMode(EditorToolMode.WIRE) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1535, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.WIRE,
                                                    tooltip: '连线 (W)：点引脚→加拐点→再点拐点放端点，或点另一引脚完成',
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
                                                iconName: ProteusIconName.WIRE, tooltip: '连线 (W)：点引脚→加拐点→再点拐点放端点，或点另一引脚完成', showLabel: false,
                                                active: this.toolMode === EditorToolMode.WIRE,
                                                disabled: this.simRunning
                                            });
                                        }
                                    }, { name: "ProteusToolButton" });
                                }
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                label: { "id": 83886178, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                showLabel: true,
                                                tooltip: 'WAR 导线自动寻路（Proteus Wire Auto Router）：开=避让器件/引脚/导线，预览路径即落线路径',
                                                active: this.warEnabled,
                                                onAction: () => this.toggleWar()
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1539, col: 9 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    iconName: ProteusIconName.AI_ROUTE,
                                                    label: { "id": 83886178, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                    showLabel: true,
                                                    tooltip: 'WAR 导线自动寻路（Proteus Wire Auto Router）：开=避让器件/引脚/导线，预览路径即落线路径',
                                                    active: this.warEnabled,
                                                    onAction: () => this.toggleWar()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                iconName: ProteusIconName.AI_ROUTE,
                                                label: { "id": 83886178, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                showLabel: true,
                                                tooltip: 'WAR 导线自动寻路（Proteus Wire Auto Router）：开=避让器件/引脚/导线，预览路径即落线路径',
                                                active: this.warEnabled
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
                                                onAction: () => this.setToolMode(EditorToolMode.BUS) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1547, col: 9 });
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
                                                active: this.toolMode === EditorToolMode.LABEL, onAction: () => this.setToolMode(EditorToolMode.LABEL) }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1551, col: 9 });
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
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'VCC') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1553, col: 9 });
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
                                                onAction: () => this.setToolMode(EditorToolMode.PLACE, 'GND') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1555, col: 9 });
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
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1560, col: 9 });
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
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1562, col: 9 });
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
                                            disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1564, col: 9 });
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1566, col: 9 });
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
                                            disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1578, col: 9 });
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
                                            disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1580, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1559, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Align',
                            content: () => {
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusToolButton(this, { iconName: ProteusIconName.ALIGN_LEFT, tooltip: '左对齐', showLabel: false,
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('left') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1560, col: 9 });
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
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('right') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1562, col: 9 });
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
                                                disabled: this.selectedCount < 2, onAction: () => this.handleAlign('top') }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1564, col: 9 });
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1566, col: 9 });
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
                                                disabled: this.selectedComponentId.length === 0, onAction: () => this.handleRotate() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1578, col: 9 });
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
                                                disabled: this.selectedComponentId.length === 0, onAction: () => this.handleMirror() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1580, col: 9 });
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
                                                    await this.startSimFromUi();
                                                }
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1585, col: 9 });
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
                                                        await this.startSimFromUi();
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
                                            disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1598, col: 9 });
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1600, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1584, col: 7 });
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
                                                        await this.startSimFromUi();
                                                    }
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1585, col: 9 });
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
                                                            await this.startSimFromUi();
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
                                                disabled: !this.simRunning, onAction: () => { this.toggleSimPause(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1598, col: 9 });
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1600, col: 9 });
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1611, col: 9 });
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1620, col: 9 });
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
                                            } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1629, col: 9 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1610, col: 7 });
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1611, col: 9 });
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1620, col: 9 });
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
                                                } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1629, col: 9 });
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
                        onAction: () => { this.statusMessage = 'All tools available in menus'; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1641, col: 7 });
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
    LeftExpandStrip(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(32);
            Column.height('100%');
            Column.padding({ top: 8 });
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            Column.border({ width: { right: 1 }, color: ProteusColors.DIVIDER });
            Column.justifyContent(FlexAlign.Start);
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.width(28);
            Button.height(48);
            Button.backgroundColor(ProteusColors.SIDEBAR_TAB_ACTIVE_BG);
            Button.borderRadius(0);
            Button.border({
                width: { left: 1, top: 1, right: 1, bottom: 1 },
                color: ProteusColors.SIDEBAR_TAB_BORDER
            });
            Button.stateEffect(false);
            Button.onClick(() => {
                this.leftLibCollapsed = false;
                this.leftNavCollapsed = false;
                this.uiState.leftLibCollapsed = false;
                this.uiState.leftNavCollapsed = false;
            });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('▶');
            Text.fontSize(14);
            Text.fontColor(ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT);
            Text.fontWeight(FontWeight.Bold);
        }, Text);
        Text.pop();
        Button.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('库');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.SIDEBAR_TAB_IDLE_TEXT);
            Text.margin({ top: 6 });
        }, Text);
        Text.pop();
        Column.pop();
    }
    RightExpandStrip(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(32);
            Column.height('100%');
            Column.padding({ top: 8 });
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            Column.border({ width: { left: 1 }, color: ProteusColors.DIVIDER });
            Column.justifyContent(FlexAlign.Start);
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.width(28);
            Button.height(48);
            Button.backgroundColor(ProteusColors.SIDEBAR_TAB_ACTIVE_BG);
            Button.borderRadius(0);
            Button.border({
                width: { left: 1, top: 1, right: 1, bottom: 1 },
                color: ProteusColors.SIDEBAR_TAB_BORDER
            });
            Button.stateEffect(false);
            Button.onClick(() => {
                this.rightCollapsed = false;
                this.uiState.rightCollapsed = false;
            });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('◀');
            Text.fontSize(14);
            Text.fontColor(ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT);
            Text.fontWeight(FontWeight.Bold);
        }, Text);
        Text.pop();
        Button.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('栏');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.SIDEBAR_TAB_IDLE_TEXT);
            Text.margin({ top: 6 });
        }, Text);
        Text.pop();
        Column.pop();
    }
    LeftPanel(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.leftPanelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: { right: 1 }, color: ProteusColors.DIVIDER });
            Column.key(`left_panel_${this.themeRefreshKey}`);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.leftLibCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Button.createWithChild({ type: ButtonType.Normal });
                        Button.width('100%');
                        Button.height(ProteusDimens.PANEL_TITLE_HEIGHT);
                        Button.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                        Button.borderRadius(0);
                        Button.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
                        Button.stateEffect(false);
                        Button.onClick(() => {
                            this.leftLibCollapsed = false;
                            this.uiState.leftLibCollapsed = false;
                        });
                    }, Button);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 6 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('▶');
                        Text.fontSize(12);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontWeight(FontWeight.Bold);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create({ "id": 83886091, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" });
                        Text.fontSize(ProteusFonts.TITLE);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                    }, Text);
                    Text.pop();
                    Row.pop();
                    Button.pop();
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1756, col: 11 });
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
                        __Common__.create();
                        __Common__.margin({ left: 4, right: 4, top: 4, bottom: 2 });
                        __Common__.width('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    placeholder: { "id": 83886131, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    text: this.searchKeyword,
                                    onChange: (v: string) => {
                                        this.searchKeyword = v;
                                        this.refreshComponentList();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1761, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        placeholder: { "id": 83886131, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                        text: this.searchKeyword,
                                        onChange: (v: string) => {
                                            this.searchKeyword = v;
                                            this.refreshComponentList();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    placeholder: { "id": 83886131, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                    text: this.searchKeyword
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
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
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1776, col: 19 });
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
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1786, col: 21 });
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
                                    this.forEachUpdateFunction(elmtId, this.categoryNodes, forEachItemGenFunction, (node: CategoryNode) => `${node.cat}_${this.libRefreshKey}_${node.label}`, true, false);
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
                                let componentCall = new ComponentPreview(this, { libraryId: this.previewComponentId, themeRefreshKey: this.themeRefreshKey }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1806, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        libraryId: this.previewComponentId,
                                        themeRefreshKey: this.themeRefreshKey
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    libraryId: this.previewComponentId, themeRefreshKey: this.themeRefreshKey
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
            if (this.leftNavCollapsed) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Button.createWithChild({ type: ButtonType.Normal });
                        Button.width('100%');
                        Button.height(ProteusDimens.PANEL_TITLE_HEIGHT);
                        Button.backgroundColor(ProteusColors.PANEL_TITLE_BG);
                        Button.borderRadius(0);
                        Button.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
                        Button.stateEffect(false);
                        Button.onClick(() => {
                            this.leftNavCollapsed = false;
                            this.uiState.leftNavCollapsed = false;
                        });
                    }, Button);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 6 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('▶');
                        Text.fontSize(12);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontWeight(FontWeight.Bold);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create({ "id": 83886092, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" });
                        Text.fontSize(ProteusFonts.TITLE);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                    }, Text);
                    Text.pop();
                    Row.pop();
                    Button.pop();
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1847, col: 11 });
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
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886106, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 0, onSelect: () => { this.navTab = 0; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1853, col: 13 });
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
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886102, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 1, onSelect: () => { this.navTab = 1; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1854, col: 13 });
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
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886104, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 2, onSelect: () => { this.navTab = 2; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1855, col: 13 });
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
                                let componentCall = new ProteusNavTab(this, { label: { "id": 83886103, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" }, selected: this.navTab === 3, onSelect: () => { this.navTab = 3; } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1856, col: 13 });
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
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1895, col: 7 });
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
            this.forEachUpdateFunction(elmtId, this.getCategoryItems(cat), forEachItemGenFunction, (item: string) => `${item}_${this.libRefreshKey}`, false, false);
        }, ForEach);
        ForEach.pop();
    }
    getCategoryItems(cat: ComponentCategory): string[] {
        const items = this.appService.componentLibrary.listAllByCategory(cat);
        return items.map(c => `${c.id}|${c.name}`);
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1912, col: 5 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1920, col: 5 });
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
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1931, col: 7 });
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
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1950, col: 7 });
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1979, col: 9 });
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
                        themeRefreshKey: this.themeRefreshKey,
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 1993, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            canvasVersion: this.canvasVersion,
                            themeRefreshKey: this.themeRefreshKey,
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
                        themeRefreshKey: this.themeRefreshKey,
                        rulerVisible: this.rulerVisible,
                        ercErrors: this.ercErrors
                    });
                }
            }, { name: "SchematicCanvas" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.selectedComponentId && !this.aiGenerating) {
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.aiGenerating) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 10 });
                        Column.width('100%');
                        Column.height('100%');
                        Column.justifyContent(FlexAlign.Center);
                        Column.alignItems(HorizontalAlign.Center);
                        Column.backgroundColor('#CC1A1A1A');
                        Column.hitTestBehavior(HitTestMode.Default);
                        Column.onTouch((_e: TouchEvent) => {
                            // 吞掉全部触摸，禁止平移/缩放/放置
                        });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('AI 生成中');
                        Text.fontSize(18);
                        Text.fontColor('#FFFFFF');
                        Text.fontWeight(FontWeight.Medium);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.aiStage.length > 0 ? `${this.aiStage}  ${this.aiProgress}%` : `${this.aiProgress}%`);
                        Text.fontSize(13);
                        Text.fontColor('#E0E0E0');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('画布已锁定 · 仅允许 AI 自动放置与布线');
                        Text.fontSize(12);
                        Text.fontColor('#BDBDBD');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('详见右侧 AI 面板生成日志');
                        Text.fontSize(11);
                        Text.fontColor('#9E9E9E');
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
                        onAction: () => this.handleRotate() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2054, col: 7 });
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
                        onAction: () => this.handleMirror() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2056, col: 7 });
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
                        onAction: () => this.handleDeleteSelected() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2058, col: 7 });
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
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2060, col: 7 });
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
                                    } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2067, col: 9 });
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
            Column.key(`right_panel_${this.themeRefreshKey}`);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, {
                        title: { "id": 83886113, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                        collapsed: false,
                        onToggle: () => { this.rightCollapsed = true; this.uiState.rightCollapsed = true; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2093, col: 7 });
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
                        __Common__.key(`prop-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`);
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2101, col: 11 });
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
                        __Common__.key(`instr-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`);
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new InstrumentPanel(this, {
                                    statusMessage: this.__statusMessage,
                                    selectedComponentId: this.selectedComponentId,
                                    simWaveTick: this.simWaveTick,
                                    simRunning: this.simRunning
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2116, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        statusMessage: this.statusMessage,
                                        selectedComponentId: this.selectedComponentId,
                                        simWaveTick: this.simWaveTick,
                                        simRunning: this.simRunning
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    selectedComponentId: this.selectedComponentId,
                                    simWaveTick: this.simWaveTick,
                                    simRunning: this.simRunning
                                });
                            }
                        }, { name: "InstrumentPanel" });
                    }
                    __Common__.pop();
                });
            }
            else if (this.activeRightTab === 7) {
                this.ifElseBranchUpdateFunction(2, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.key(`settings-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`);
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                        __Common__.width('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new PlatformSettingsPanel(this, { statusMessage: this.__statusMessage, themeRefreshKey: this.__themeRefreshKey }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2126, col: 11 });
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
            else if (this.activeRightTab === 8) {
                this.ifElseBranchUpdateFunction(3, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.key(`trace-${this.rightPanelRefreshKey}-${this.themeRefreshKey}`);
                        __Common__.layoutWeight(1);
                        __Common__.height('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new InstrTraceLogPanel(this, { statusMessage: this.__statusMessage }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2132, col: 11 });
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
                        }, { name: "InstrTraceLogPanel" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(4, () => {
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
                                            let componentCall = new ProteusSectionTitle(this, { title: '仿真控制' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2141, col: 19 });
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
                                                label: this.simRunning ? { "id": 83886135, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" } : { "id": 83886134, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: this.simRunning ? '停止仿真' : '运行仿真',
                                                widthVal: '42%',
                                                onAction: async () => {
                                                    if (this.simRunning) {
                                                        this.appService.stopSimulation();
                                                        this.simRunning = false;
                                                    }
                                                    else {
                                                        await this.startSimFromUi();
                                                    }
                                                }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2164, col: 21 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: this.simRunning ? { "id": 83886135, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" } : { "id": 83886134, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                    tooltip: this.simRunning ? '停止仿真' : '运行仿真',
                                                    widthVal: '42%',
                                                    onAction: async () => {
                                                        if (this.simRunning) {
                                                            this.appService.stopSimulation();
                                                            this.simRunning = false;
                                                        }
                                                        else {
                                                            await this.startSimFromUi();
                                                        }
                                                    }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: this.simRunning ? { "id": 83886135, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" } : { "id": 83886134, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
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
                                                label: { "id": 83886133, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                tooltip: '暂停/恢复仿真',
                                                widthVal: '42%',
                                                onAction: () => { this.toggleSimPause(); }
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2177, col: 21 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: { "id": 83886133, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
                                                    tooltip: '暂停/恢复仿真',
                                                    widthVal: '42%',
                                                    onAction: () => { this.toggleSimPause(); }
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: { "id": 83886133, "type": 10003, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" },
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
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2211, col: 19 });
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
                                    __Common__.key(`ai-settings-${this.themeRefreshKey}`);
                                    __Common__.constraintSize({ minHeight: 280 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new 
                                            // API 配置挂全局金库：工程切换时勿用 rightPanelRefreshKey remount，避免面板状态被刷掉
                                            AiSettingsPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                aiGenerating: this.__aiGenerating,
                                                aiProgress: this.__aiProgress,
                                                aiStage: this.__aiStage
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2263, col: 17 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    statusMessage: this.statusMessage,
                                                    aiGenerating: this.aiGenerating,
                                                    aiProgress: this.aiProgress,
                                                    aiStage: this.aiStage
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
                                    __Common__.key(`mcu-${this.rightPanelRefreshKey}`);
                                    __Common__.constraintSize({ minHeight: 320 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new McuDebugPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2272, col: 17 });
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
                                    __Common__.key(`fault-${this.rightPanelRefreshKey}`);
                                    __Common__.constraintSize({ minHeight: 240 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new FaultInjectionPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2279, col: 17 });
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
                                    __Common__.key(`teach-${this.rightPanelRefreshKey}`);
                                    __Common__.constraintSize({ minHeight: 240 });
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new TeachingPanel(this, {
                                                statusMessage: this.__statusMessage,
                                                selectedComponentId: this.selectedComponentId
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2286, col: 17 });
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
                        else {
                            this.ifElseBranchUpdateFunction(5, () => {
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2302, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2307, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2312, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2318, col: 13 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2330, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2335, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2340, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2345, col: 11 });
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
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSidebarTab(this, {
                        label: '日志', tooltip: 'instr_trace 运行日志', icon: ProteusIconName.SEARCH,
                        selected: this.activeRightTab === 8,
                        onSelect: () => { this.setActiveRightTab(8); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2350, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '日志',
                            tooltip: 'instr_trace 运行日志',
                            icon: ProteusIconName.SEARCH,
                            selected: this.activeRightTab === 8,
                            onSelect: () => { this.setActiveRightTab(8); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '日志', tooltip: 'instr_trace 运行日志', icon: ProteusIconName.SEARCH,
                        selected: this.activeRightTab === 8
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
                        onAction: () => { void this.handleNewProject(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2391, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '新建工程',
                            widthVal: '48%',
                            onAction: () => { void this.handleNewProject(); }
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2396, col: 11 });
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
            Stack.create({ alignContent: Alignment.Center });
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showNewProjectDialog = false; });
        }, Column);
        Column.pop();
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
            __Common__.create();
            __Common__.width('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: 'MyProject',
                        text: this.newProjectNameInput,
                        onChange: (v: string) => { this.newProjectNameInput = v; },
                        onSubmit: () => { this.doCreateNewProject(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2441, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: 'MyProject',
                            text: this.newProjectNameInput,
                            onChange: (v: string) => { this.newProjectNameInput = v; },
                            onSubmit: () => { this.doCreateNewProject(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: 'MyProject',
                        text: this.newProjectNameInput
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2449, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2457, col: 11 });
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
        Stack.pop();
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2513, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2521, col: 11 });
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
                            void this.handleNewProject();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2528, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '新建工程',
                            widthVal: '32%',
                            onAction: () => {
                                this.showRecoveryDialog = false;
                                void this.handleNewProject();
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
            this.appService.enableAutoSave(`${this.appService.getAutosaveDir()}/${name}.schsim`, AppService.AUTOSAVE_INTERVAL_MS);
            this.appService.schematicEditor.fitAllInView();
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
            __Common__.create();
            __Common__.width('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: `${this.userProjectDir}/MyProject.schsim`,
                        text: this.openFilePath,
                        onChange: (v: string) => { this.openFilePath = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2588, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: `${this.userProjectDir}/MyProject.schsim`,
                            text: this.openFilePath,
                            onChange: (v: string) => { this.openFilePath = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: `${this.userProjectDir}/MyProject.schsim`,
                        text: this.openFilePath
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2595, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2600, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2605, col: 11 });
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
            __Common__.create();
            __Common__.width('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: `${this.userProjectDir}/${this.projectName}.schsim`,
                        text: this.saveAsPath,
                        onChange: (v: string) => { this.saveAsPath = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2645, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: `${this.userProjectDir}/${this.projectName}.schsim`,
                            text: this.saveAsPath,
                            onChange: (v: string) => { this.saveAsPath = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: `${this.userProjectDir}/${this.projectName}.schsim`,
                        text: this.saveAsPath
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2652, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2657, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2699, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2704, col: 11 });
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
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: '/path/to/firmware.hex',
                        text: this.burnFilePath,
                        onChange: (v: string) => { this.burnFilePath = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2720, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: '/path/to/firmware.hex',
                            text: this.burnFilePath,
                            onChange: (v: string) => { this.burnFilePath = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: '/path/to/firmware.hex',
                        text: this.burnFilePath
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '浏览',
                        widthVal: 60,
                        onAction: () => { void this.doBrowseHexFile(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2726, col: 11 });
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
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: this.burnEntryPoint,
                        placeholder: '0x0000',
                        mono: true,
                        onChange: (v: string) => { this.burnEntryPoint = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2741, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: this.burnEntryPoint,
                            placeholder: '0x0000',
                            mono: true,
                            onChange: (v: string) => { this.burnEntryPoint = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: this.burnEntryPoint,
                        placeholder: '0x0000',
                        mono: true
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2770, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2778, col: 11 });
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
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(380);
            Column.padding(24);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.borderRadius(8);
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2815, col: 11 });
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
                            void this.appService.flushProjectProtection(true);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2820, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '不保存',
                            widthVal: '30%',
                            onAction: () => {
                                this.unsavedChanges = false;
                                this.showExitConfirmDialog = false;
                                void this.appService.flushProjectProtection(true);
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
                                    void this.appService.flushProjectProtection(true);
                                }
                            });
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2829, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '保存',
                            widthVal: '30%',
                            onAction: () => {
                                this.showExitConfirmDialog = false;
                                void this.handleSaveProject().then(() => {
                                    if (!this.unsavedChanges) {
                                        void this.appService.flushProjectProtection(true);
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
    /** 仿真启动失败提示 */
    SimFailDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create({ alignContent: Alignment.Center });
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#00000060');
            Column.onClick(() => { this.showSimFailDialog = false; });
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(400);
            Column.padding(24);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.borderRadius(8);
            Column.shadow({ radius: 8, color: '#00000040' });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('无法启动仿真');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.ERC_WARN);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.simFailMessage);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ bottom: 16 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.justifyContent(FlexAlign.Center);
            Row.margin({ top: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '确定',
                        widthVal: '40%',
                        onAction: () => { this.showSimFailDialog = false; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2879, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '确定',
                            widthVal: '40%',
                            onAction: () => { this.showSimFailDialog = false; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '确定',
                        widthVal: '40%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        Stack.pop();
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
            Row.key(`status_bar_${this.themeRefreshKey}`);
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
                    let componentCall = new ProteusVDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2921, col: 7 });
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
                    let componentCall = new ProteusVDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/Index.ets", line: 2938, col: 7 });
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
