import { EventBus, ModuleEvent } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ErcError, ProgressInfo, ComponentCategory } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AppService } from '../services/AppService';
import { EditorToolMode } from "@bundle:com.elecdraw.aischsim/entry/ets/model/EditorToolMode";
export interface CategoryNode {
    cat: ComponentCategory;
    label: string;
    expanded: boolean;
}
@Observed
export class AppViewModel {
    projectName: string = 'Untitled';
    simRunning: boolean = false;
    simPaused: boolean = false;
    statusMessage: string = '就绪';
    canvasVersion: number = 0;
    selectedComponentId: string = '';
    searchKeyword: string = '';
    componentList: string[] = [];
    ercCount: number = 0;
    ercErrors: ErcError[] = [];
    aiProgress: number = 0;
    aiStage: string = '';
    mouseX: number = 0;
    mouseY: number = 0;
    zoomPercent: number = 100;
    gridVisible: boolean = true;
    rulerVisible: boolean = true;
    selectedCount: number = 0;
    navTab: number = 0;
    leftLibCollapsed: boolean = false;
    leftNavCollapsed: boolean = false;
    rightCollapsed: boolean = false;
    expandedSim: boolean = true;
    expandedAi: boolean = false;
    expandedDebug: boolean = false;
    expandedInstr: boolean = false;
    expandedFault: boolean = false;
    expandedTeach: boolean = false;
    expandedSettings: boolean = false;
    categoryNodes: CategoryNode[] = [];
    expandedCategories: Set<ComponentCategory> = new Set();
    selectedTreeItem: string = '';
    previewComponentId: string = '';
    toolMode: EditorToolMode = EditorToolMode.SELECT;
    wireStartActive: boolean = false;
    wireStartX: number = 0;
    wireStartY: number = 0;
    navRefreshKey: number = 0;
    themeRefreshKey: number = 0;
    selectedLocked: boolean = false;
    private appService: AppService;
    private static instance: AppViewModel | null = null;
    constructor(z251: AppService) {
        this.appService = z251;
    }
    static getInstance(y251: AppService): AppViewModel {
        if (!AppViewModel.instance) {
            AppViewModel.instance = new AppViewModel(y251);
        }
        return AppViewModel.instance;
    }
    bindCallbacks(): void {
        this.appService.onStatusMessage = (x251: string) => { this.statusMessage = x251; };
        this.appService.onErcUpdate = (w251: ErcError[]) => {
            this.ercCount = w251.length;
            this.ercErrors = w251;
        };
        this.appService.onAiProgress = (v251: ProgressInfo) => {
            this.aiProgress = v251.progress;
            this.aiStage = v251.stage;
        };
        this.appService.onProjectChanged = () => {
            this.projectName = this.appService.currentProject?.name ?? 'Untitled';
            this.canvasVersion++;
        };
        EventBus.getInstance().subscribe(ModuleEvent.SCHEMATIC_CHANGED, () => {
            this.canvasVersion++;
        });
    }
    bumpCanvas(): void {
        this.canvasVersion++;
    }
}
