if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface HomePage_Params {
    themeRev?: number;
    recentEntries?: HomeProjectEntry[];
    sampleEntries?: HomeProjectEntry[];
    recoveryFiles?: string[];
    userProjectDir?: string;
    selectedPath?: string;
    ready?: boolean;
    showWizard?: boolean;
    wizardStep?: number;
    wizardProjectName?: string;
    showSamples?: boolean;
    ignoreBeta?: boolean;
    newsItems?: ProteusHomeNewsItem[];
    aboutInfo?: HomeAboutSnapshot;
    newsHighlight?: boolean;
    showMigrationGuide?: boolean;
    showHelpDialog?: boolean;
    helpDialogTitle?: string;
    helpDialogBody?: string;
    helpDialogPrimaryLabel?: string;
    helpDialogPrimaryAction?: (() => void) | null;
    appService?: AppService;
    newsHighlightTimer?: number;
    launchGuard?: boolean;
}
import type { BusinessError } from "@ohos:base";
import type common from "@ohos:app.ability.common";
import picker from "@ohos:file.picker";
import fileUri from "@ohos:file.fileuri";
import fs from "@ohos:file.fs";
import { APP_VERSION_CODE, APP_VERSION_NAME, appVersionLabel, Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusHomeColors, ProteusHomeDownloadBtn, ProteusHomeIconLink, ProteusHomeInlineLink, ProteusHomePanel, ProteusHomeRecentRow, ProteusHomeTopBar, ProteusHomeWizardDialog, ProteusHomeBottomStrip, ProteusHomeTextDialog, ProteusHomeBackdrop, ProteusHomeAboutRow, ProteusHomeHelpDialog, ProteusHomeSectionTitle, ProteusHomeSectionDivider, ProteusHomeNewsRow } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusHomeWidgets";
import type { ProteusHomeNewsItem } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusHomeWidgets";
import { maximizeAppWindow } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/WindowLaunchUtil";
import { ProjectPaths } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/ProjectPaths";
import { collectHomeAboutInfo, defaultHomeAboutSnapshot } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/HomeAboutInfo";
import type { HomeAboutSnapshot } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/HomeAboutInfo";
interface HomeLaunchParams {
    launchMode: string;
    projectPath?: string;
    projectName?: string;
    showRecovery?: boolean;
    autoStartSim?: boolean;
    openRightTab?: number;
    expandRightPanel?: boolean;
    /** 为 true 时 blank/scratch 会启用 autosave（默认 false，仅内存工作区） */
    persistProject?: boolean;
}
interface HomeScratchOptions {
    projectName?: string;
    autoStartSim?: boolean;
    openRightTab?: number;
    expandRightPanel?: boolean;
}
const MIGRATION_GUIDE_TEXT: string = '从 Proteus / 其他 EDA 迁移到 AI-SCH Design Suite\n\n' +
    '1. 工程文件\n' +
    '   · 本软件使用 .schsim 工程格式（JSON 原理图文档）\n' +
    '   · 通过 文件 → 打开 导入已有工程，或从 Start → Open Sample 加载 Test_Template 示例\n\n' +
    '2. 器件与网表\n' +
    '   · 内置 DeviceLibrary 与 proteus_alias.json 别名映射\n' +
    '   · 放置器件后使用 仿真 → ERC 检查连接\n\n' +
    '3. 仿真流程\n' +
    '   · 绘制原理图 → F5 或工具栏运行仿真 → 右侧「仿真 / 仪器」面板查看波形\n' +
    '   · MCU 实验模板可在 教学 面板一键加载\n\n' +
    '4. 快捷键\n' +
    '   · Ctrl+N/O/S 新建/打开/保存  · F5 仿真  · F7 ERC  · W 连线  · P 放置\n\n' +
    '5. 获取更多帮助\n' +
    '   · Help → Help Home 打开教学助手与实验模板库\n' +
    '   · Start → Open Sample 浏览 lab_* 教程工程';
const HELP_HOME_TEXT: string = 'Help Home — 教学与实验\n\n' +
    '· 进入编辑器后，右侧「教学」面板提供实验模板、步骤说明与 MCU 实验入口\n' +
    '· 也可从 Start → Open Sample 打开 lab_* / Test_Template 教程工程\n' +
    '· 快捷键 F5 运行仿真，F7 执行 ERC\n\n' +
    '提示：点击下方「打开教学面板」将进入未保存工作区，不会自动创建工程文件。';
const HELP_SCHEMATIC_TEXT: string = 'Schematic Capture — 原理图绘制\n\n' +
    '· W：连线模式  · P：放置器件  · 拖放左侧库中元件到画布\n' +
    '· Ctrl+S 保存工程  · Ctrl+N 通过系统对话框另存为新工程\n' +
    '· 仿真前建议 F7 ERC 检查连接\n\n' +
    '从 Getting Started → Schematic Capture 可进入空白画布（不自动写盘）。';
const HELP_SIMULATION_TEXT: string = 'Simulation — 电路仿真\n\n' +
    '· F5 或工具栏运行仿真，右侧「仿真 / 仪器」查看波形与探针\n' +
    '· 需先放置电源、地及完整网表；空工程运行仿真不会生成工程文件\n\n' +
    '从 Getting Started → Simulation 可打开仿真侧栏；保存请使用 文件 → 保存。';
const HELP_PCB_TEXT: string = 'PCB Layout — KiCad 式 PCB 布局\n\n' +
    '· 从原理图「更新 PCB」导入封装与网络\n' +
    '· 选择/移动/旋转封装，走线、过孔工具\n' +
    '· 左侧图层开关，右侧 DRC 检查\n' +
    '· 与原理图共用 .schsim 工程文件';
const HELP_VISUAL_DESIGNER_TEXT: string = 'Visual Designer 尚未在本版本中提供。\n\n' +
    '请使用 Schematic Capture 与 Simulation 完成设计与验证。';
const UPDATES_INFO_TEXT: string = '版本更新通过应用分发渠道发布。\n\n' +
    '当前运行版本已在 News 列表中标记为 In Use。如需教程工程，请使用 Start → Open Sample。';
interface HomeProjectEntry {
    path: string;
    name: string;
    modifiedMs: number;
    isRecovery: boolean;
}
class HomePage extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__recentEntries = new ObservedPropertyObjectPU([], this, "recentEntries");
        this.__sampleEntries = new ObservedPropertyObjectPU([], this, "sampleEntries");
        this.__recoveryFiles = new ObservedPropertyObjectPU([], this, "recoveryFiles");
        this.__userProjectDir = new ObservedPropertySimplePU('', this, "userProjectDir");
        this.__selectedPath = new ObservedPropertySimplePU('', this, "selectedPath");
        this.__ready = new ObservedPropertySimplePU(false, this, "ready");
        this.__showWizard = new ObservedPropertySimplePU(false, this, "showWizard");
        this.__wizardStep = new ObservedPropertySimplePU(0, this, "wizardStep");
        this.__wizardProjectName = new ObservedPropertySimplePU('', this, "wizardProjectName");
        this.__showSamples = new ObservedPropertySimplePU(false, this, "showSamples");
        this.__ignoreBeta = new ObservedPropertySimplePU(false, this, "ignoreBeta");
        this.__newsItems = new ObservedPropertyObjectPU([], this, "newsItems");
        this.__aboutInfo = new ObservedPropertyObjectPU(defaultHomeAboutSnapshot(), this, "aboutInfo");
        this.__newsHighlight = new ObservedPropertySimplePU(false, this, "newsHighlight");
        this.__showMigrationGuide = new ObservedPropertySimplePU(false, this, "showMigrationGuide");
        this.__showHelpDialog = new ObservedPropertySimplePU(false, this, "showHelpDialog");
        this.__helpDialogTitle = new ObservedPropertySimplePU('', this, "helpDialogTitle");
        this.__helpDialogBody = new ObservedPropertySimplePU('', this, "helpDialogBody");
        this.__helpDialogPrimaryLabel = new ObservedPropertySimplePU('', this, "helpDialogPrimaryLabel");
        this.helpDialogPrimaryAction = null;
        this.appService = AppService.getInstance();
        this.newsHighlightTimer = -1;
        this.launchGuard = false;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: HomePage_Params) {
        if (params.recentEntries !== undefined) {
            this.recentEntries = params.recentEntries;
        }
        if (params.sampleEntries !== undefined) {
            this.sampleEntries = params.sampleEntries;
        }
        if (params.recoveryFiles !== undefined) {
            this.recoveryFiles = params.recoveryFiles;
        }
        if (params.userProjectDir !== undefined) {
            this.userProjectDir = params.userProjectDir;
        }
        if (params.selectedPath !== undefined) {
            this.selectedPath = params.selectedPath;
        }
        if (params.ready !== undefined) {
            this.ready = params.ready;
        }
        if (params.showWizard !== undefined) {
            this.showWizard = params.showWizard;
        }
        if (params.wizardStep !== undefined) {
            this.wizardStep = params.wizardStep;
        }
        if (params.wizardProjectName !== undefined) {
            this.wizardProjectName = params.wizardProjectName;
        }
        if (params.showSamples !== undefined) {
            this.showSamples = params.showSamples;
        }
        if (params.ignoreBeta !== undefined) {
            this.ignoreBeta = params.ignoreBeta;
        }
        if (params.newsItems !== undefined) {
            this.newsItems = params.newsItems;
        }
        if (params.aboutInfo !== undefined) {
            this.aboutInfo = params.aboutInfo;
        }
        if (params.newsHighlight !== undefined) {
            this.newsHighlight = params.newsHighlight;
        }
        if (params.showMigrationGuide !== undefined) {
            this.showMigrationGuide = params.showMigrationGuide;
        }
        if (params.showHelpDialog !== undefined) {
            this.showHelpDialog = params.showHelpDialog;
        }
        if (params.helpDialogTitle !== undefined) {
            this.helpDialogTitle = params.helpDialogTitle;
        }
        if (params.helpDialogBody !== undefined) {
            this.helpDialogBody = params.helpDialogBody;
        }
        if (params.helpDialogPrimaryLabel !== undefined) {
            this.helpDialogPrimaryLabel = params.helpDialogPrimaryLabel;
        }
        if (params.helpDialogPrimaryAction !== undefined) {
            this.helpDialogPrimaryAction = params.helpDialogPrimaryAction;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.newsHighlightTimer !== undefined) {
            this.newsHighlightTimer = params.newsHighlightTimer;
        }
        if (params.launchGuard !== undefined) {
            this.launchGuard = params.launchGuard;
        }
    }
    updateStateVars(params: HomePage_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__recentEntries.purgeDependencyOnElmtId(rmElmtId);
        this.__sampleEntries.purgeDependencyOnElmtId(rmElmtId);
        this.__recoveryFiles.purgeDependencyOnElmtId(rmElmtId);
        this.__userProjectDir.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedPath.purgeDependencyOnElmtId(rmElmtId);
        this.__ready.purgeDependencyOnElmtId(rmElmtId);
        this.__showWizard.purgeDependencyOnElmtId(rmElmtId);
        this.__wizardStep.purgeDependencyOnElmtId(rmElmtId);
        this.__wizardProjectName.purgeDependencyOnElmtId(rmElmtId);
        this.__showSamples.purgeDependencyOnElmtId(rmElmtId);
        this.__ignoreBeta.purgeDependencyOnElmtId(rmElmtId);
        this.__newsItems.purgeDependencyOnElmtId(rmElmtId);
        this.__aboutInfo.purgeDependencyOnElmtId(rmElmtId);
        this.__newsHighlight.purgeDependencyOnElmtId(rmElmtId);
        this.__showMigrationGuide.purgeDependencyOnElmtId(rmElmtId);
        this.__showHelpDialog.purgeDependencyOnElmtId(rmElmtId);
        this.__helpDialogTitle.purgeDependencyOnElmtId(rmElmtId);
        this.__helpDialogBody.purgeDependencyOnElmtId(rmElmtId);
        this.__helpDialogPrimaryLabel.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__recentEntries.aboutToBeDeleted();
        this.__sampleEntries.aboutToBeDeleted();
        this.__recoveryFiles.aboutToBeDeleted();
        this.__userProjectDir.aboutToBeDeleted();
        this.__selectedPath.aboutToBeDeleted();
        this.__ready.aboutToBeDeleted();
        this.__showWizard.aboutToBeDeleted();
        this.__wizardStep.aboutToBeDeleted();
        this.__wizardProjectName.aboutToBeDeleted();
        this.__showSamples.aboutToBeDeleted();
        this.__ignoreBeta.aboutToBeDeleted();
        this.__newsItems.aboutToBeDeleted();
        this.__aboutInfo.aboutToBeDeleted();
        this.__newsHighlight.aboutToBeDeleted();
        this.__showMigrationGuide.aboutToBeDeleted();
        this.__showHelpDialog.aboutToBeDeleted();
        this.__helpDialogTitle.aboutToBeDeleted();
        this.__helpDialogBody.aboutToBeDeleted();
        this.__helpDialogPrimaryLabel.aboutToBeDeleted();
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
    private __recentEntries: ObservedPropertyObjectPU<HomeProjectEntry[]>;
    get recentEntries() {
        return this.__recentEntries.get();
    }
    set recentEntries(newValue: HomeProjectEntry[]) {
        this.__recentEntries.set(newValue);
    }
    private __sampleEntries: ObservedPropertyObjectPU<HomeProjectEntry[]>;
    get sampleEntries() {
        return this.__sampleEntries.get();
    }
    set sampleEntries(newValue: HomeProjectEntry[]) {
        this.__sampleEntries.set(newValue);
    }
    private __recoveryFiles: ObservedPropertyObjectPU<string[]>;
    get recoveryFiles() {
        return this.__recoveryFiles.get();
    }
    set recoveryFiles(newValue: string[]) {
        this.__recoveryFiles.set(newValue);
    }
    private __userProjectDir: ObservedPropertySimplePU<string>;
    get userProjectDir() {
        return this.__userProjectDir.get();
    }
    set userProjectDir(newValue: string) {
        this.__userProjectDir.set(newValue);
    }
    private __selectedPath: ObservedPropertySimplePU<string>;
    get selectedPath() {
        return this.__selectedPath.get();
    }
    set selectedPath(newValue: string) {
        this.__selectedPath.set(newValue);
    }
    private __ready: ObservedPropertySimplePU<boolean>;
    get ready() {
        return this.__ready.get();
    }
    set ready(newValue: boolean) {
        this.__ready.set(newValue);
    }
    private __showWizard: ObservedPropertySimplePU<boolean>;
    get showWizard() {
        return this.__showWizard.get();
    }
    set showWizard(newValue: boolean) {
        this.__showWizard.set(newValue);
    }
    private __wizardStep: ObservedPropertySimplePU<number>;
    get wizardStep() {
        return this.__wizardStep.get();
    }
    set wizardStep(newValue: number) {
        this.__wizardStep.set(newValue);
    }
    private __wizardProjectName: ObservedPropertySimplePU<string>;
    get wizardProjectName() {
        return this.__wizardProjectName.get();
    }
    set wizardProjectName(newValue: string) {
        this.__wizardProjectName.set(newValue);
    }
    private __showSamples: ObservedPropertySimplePU<boolean>;
    get showSamples() {
        return this.__showSamples.get();
    }
    set showSamples(newValue: boolean) {
        this.__showSamples.set(newValue);
    }
    private __ignoreBeta: ObservedPropertySimplePU<boolean>;
    get ignoreBeta() {
        return this.__ignoreBeta.get();
    }
    set ignoreBeta(newValue: boolean) {
        this.__ignoreBeta.set(newValue);
    }
    private __newsItems: ObservedPropertyObjectPU<ProteusHomeNewsItem[]>;
    get newsItems() {
        return this.__newsItems.get();
    }
    set newsItems(newValue: ProteusHomeNewsItem[]) {
        this.__newsItems.set(newValue);
    }
    private __aboutInfo: ObservedPropertyObjectPU<HomeAboutSnapshot>;
    get aboutInfo() {
        return this.__aboutInfo.get();
    }
    set aboutInfo(newValue: HomeAboutSnapshot) {
        this.__aboutInfo.set(newValue);
    }
    private __newsHighlight: ObservedPropertySimplePU<boolean>;
    get newsHighlight() {
        return this.__newsHighlight.get();
    }
    set newsHighlight(newValue: boolean) {
        this.__newsHighlight.set(newValue);
    }
    private __showMigrationGuide: ObservedPropertySimplePU<boolean>;
    get showMigrationGuide() {
        return this.__showMigrationGuide.get();
    }
    set showMigrationGuide(newValue: boolean) {
        this.__showMigrationGuide.set(newValue);
    }
    private __showHelpDialog: ObservedPropertySimplePU<boolean>;
    get showHelpDialog() {
        return this.__showHelpDialog.get();
    }
    set showHelpDialog(newValue: boolean) {
        this.__showHelpDialog.set(newValue);
    }
    private __helpDialogTitle: ObservedPropertySimplePU<string>;
    get helpDialogTitle() {
        return this.__helpDialogTitle.get();
    }
    set helpDialogTitle(newValue: string) {
        this.__helpDialogTitle.set(newValue);
    }
    private __helpDialogBody: ObservedPropertySimplePU<string>;
    get helpDialogBody() {
        return this.__helpDialogBody.get();
    }
    set helpDialogBody(newValue: string) {
        this.__helpDialogBody.set(newValue);
    }
    private __helpDialogPrimaryLabel: ObservedPropertySimplePU<string>;
    get helpDialogPrimaryLabel() {
        return this.__helpDialogPrimaryLabel.get();
    }
    set helpDialogPrimaryLabel(newValue: string) {
        this.__helpDialogPrimaryLabel.set(newValue);
    }
    private helpDialogPrimaryAction: (() => void) | null;
    private appService: AppService;
    private newsHighlightTimer: number;
    private launchGuard: boolean;
    onPageShow(): void {
        this.launchGuard = false;
        void this.reloadOnShow();
    }
    private async reloadOnShow(): Promise<void> {
        this.recoveryFiles = await this.appService.checkRecoveryFiles();
        this.refreshLists();
        this.refreshAboutInfo();
        if (this.selectedPath.length > 0 && !this.fileExists(this.selectedPath)) {
            this.selectedPath = '';
        }
        if (this.selectedPath.length === 0 && this.recentEntries.length > 0) {
            this.selectedPath = this.recentEntries[0].path;
        }
    }
    private refreshAboutInfo(): void {
        this.aboutInfo = collectHomeAboutInfo(this.appService);
    }
    aboutToDisappear(): void {
        if (this.newsHighlightTimer >= 0) {
            clearTimeout(this.newsHighlightTimer);
            this.newsHighlightTimer = -1;
        }
    }
    async aboutToAppear(): Promise<void> {
        const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
        this.appService.initPlatform(ctx);
        void maximizeAppWindow(ctx);
        await this.appService.ensureTemplatesReady();
        this.userProjectDir = this.appService.getUserProjectDir();
        this.recoveryFiles = await this.appService.checkRecoveryFiles();
        this.initNewsItems();
        this.refreshLists();
        this.refreshAboutInfo();
        if (this.recentEntries.length > 0) {
            this.selectedPath = this.recentEntries[0].path;
        }
        this.ready = true;
        Logger.info('HomePage', `ready ver=${appVersionLabel()} recent=${this.recentEntries.length}`);
    }
    private initNewsItems(): void {
        this.newsItems = [
            { description: `AI-SCH Professional 1.2 [1.2.0]`, releaseDate: '17/06/2026', uscValid: 'Yes', actionLabel: 'Download' },
            { description: `AI-SCH Professional ${APP_VERSION_NAME} [${APP_VERSION_CODE}]`, releaseDate: '24/02/2026', uscValid: 'Yes', actionLabel: 'In Use' },
            { description: 'AI-SCH Professional 1.0 SP2 [1.0.2]', releaseDate: '21/08/2025', uscValid: 'Yes', actionLabel: 'Download' },
            { description: 'AI-SCH Professional 1.0 SP1 [1.0.1]', releaseDate: '22/10/2024', uscValid: 'Yes', actionLabel: 'Download' },
            { description: 'Sample tutorials (Test_Template)', releaseDate: '—', uscValid: '—', actionLabel: 'Open' }
        ];
    }
    private refreshLists(): void {
        this.recentEntries = this.buildRecentEntries();
        this.sampleEntries = this.buildSampleEntries();
    }
    private buildRecentEntries(): HomeProjectEntry[] {
        const merged: string[] = [];
        const seen: Set<string> = new Set();
        const push = (p: string): void => {
            if (!seen.has(p)) {
                seen.add(p);
                merged.push(p);
            }
        };
        const recents = this.appService.filePersistence.getRecentFiles();
        for (let i = 0; i < recents.length; i++) {
            push(recents[i]);
        }
        const sandbox = this.appService.listUserProjectFiles();
        for (let i = 0; i < sandbox.length; i++) {
            push(sandbox[i]);
        }
        for (let i = 0; i < this.recoveryFiles.length; i++) {
            push(this.recoveryFiles[i]);
        }
        const entries: HomeProjectEntry[] = [];
        for (let i = 0; i < merged.length; i++) {
            const path = merged[i];
            if (!this.fileExists(path)) {
                continue;
            }
            entries.push(this.entryFromPath(path, this.recoveryFiles.includes(path)));
        }
        entries.sort((a, b) => b.modifiedMs - a.modifiedMs);
        return entries;
    }
    private buildSampleEntries(): HomeProjectEntry[] {
        const entries: HomeProjectEntry[] = [];
        const seen: Set<string> = new Set();
        const baseDir = this.appService.getAppBaseDir();
        const files = this.appService.listTemplateProjectFiles();
        for (let i = 0; i < files.length; i++) {
            if (!seen.has(files[i])) {
                seen.add(files[i]);
                entries.push(this.entryFromPath(files[i], false));
            }
        }
        const labs = this.appService.listAvailableLabTemplates('all');
        for (let i = 0; i < labs.length; i++) {
            const path = ProjectPaths.templateFile(baseDir, labs[i].id);
            if (this.fileExists(path) && !seen.has(path)) {
                seen.add(path);
                const e = this.entryFromPath(path, false);
                entries.push({ path: path, name: labs[i].name, modifiedMs: e.modifiedMs, isRecovery: false });
            }
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        return entries;
    }
    private fileExists(path: string): boolean {
        try {
            fs.accessSync(path);
            return true;
        }
        catch (_e) {
            return false;
        }
    }
    private entryFromPath(path: string, isRecovery: boolean): HomeProjectEntry {
        let modifiedMs = 0;
        try {
            let ms = fs.statSync(path).mtime;
            if (ms > 0 && ms < 1000000000000) {
                ms = ms * 1000;
            }
            modifiedMs = ms;
        }
        catch (_e) { /* ignore */ }
        return { path: path, name: this.baseName(path), modifiedMs: modifiedMs, isRecovery: isRecovery };
    }
    private baseName(path: string): string {
        const norm = path.replace(/\\/g, '/');
        const slash = norm.lastIndexOf('/');
        let name = slash >= 0 ? norm.substring(slash + 1) : norm;
        if (name.endsWith('.schsim')) {
            name = name.substring(0, name.length - 7);
        }
        return name;
    }
    private listEntries(): HomeProjectEntry[] {
        return this.showSamples ? this.sampleEntries : this.recentEntries;
    }
    private goToEditor(params: HomeLaunchParams): void {
        if (this.launchGuard) {
            return;
        }
        this.launchGuard = true;
        try {
            this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index', params: params })
                .then(() => { this.launchGuard = false; })
                .catch((_e: BusinessError) => {
                this.launchGuard = false;
            });
        }
        catch (_e) {
            this.launchGuard = false;
        }
    }
    /** 进入编辑器内存工作区，不启用 autosave、不写入工程文件 */
    private launchScratchWorkspace(extra?: HomeScratchOptions): void {
        const params: HomeLaunchParams = { launchMode: 'scratch', persistProject: false };
        if (extra !== undefined) {
            if (extra.projectName !== undefined) {
                params.projectName = extra.projectName;
            }
            if (extra.autoStartSim === true) {
                params.autoStartSim = true;
            }
            if (extra.openRightTab !== undefined) {
                params.openRightTab = extra.openRightTab;
            }
            if (extra.expandRightPanel === true) {
                params.expandRightPanel = true;
            }
        }
        this.goToEditor(params);
    }
    private openHelpDialog(title: string, body: string, primaryLabel: string = '', primaryAction: (() => void) | null = null): void {
        this.helpDialogTitle = title;
        this.helpDialogBody = body;
        this.helpDialogPrimaryLabel = primaryLabel;
        this.helpDialogPrimaryAction = primaryAction;
        this.showHelpDialog = true;
    }
    private closeHelpDialog(): void {
        this.showHelpDialog = false;
        this.helpDialogPrimaryAction = null;
        this.helpDialogPrimaryLabel = '';
    }
    private runHelpDialogPrimary(): void {
        const action = this.helpDialogPrimaryAction;
        this.closeHelpDialog();
        if (action !== null) {
            action();
        }
    }
    private openProjectPath(path: string, showRecovery: boolean = false): void {
        if (path.length === 0 || !this.fileExists(path)) {
            this.refreshLists();
            return;
        }
        this.goToEditor({ launchMode: 'open', projectPath: path, showRecovery: showRecovery });
    }
    private openSelected(): void {
        if (this.selectedPath.length === 0) {
            return;
        }
        if (!this.fileExists(this.selectedPath)) {
            this.refreshLists();
            return;
        }
        this.openProjectPath(this.selectedPath, this.recoveryFiles.includes(this.selectedPath));
    }
    private getHostCtx(): common.UIAbilityContext {
        return this.getUIContext().getHostContext() as common.UIAbilityContext;
    }
    async handleOpenProject(): Promise<void> {
        try {
            const opt = new picker.DocumentSelectOptions();
            opt.maxSelectNumber = 1;
            opt.fileSuffixFilters = ['.schsim', '.json'];
            const uri = fileUri.getUriFromPath(this.userProjectDir);
            if (uri.length > 0) {
                opt.defaultFilePathUri = uri;
            }
            const uris = await new picker.DocumentViewPicker(this.getHostCtx()).select(opt);
            if (uris && uris.length > 0) {
                this.openProjectPath(uris[0]);
            }
        }
        catch (_e) { /* ignore */ }
    }
    startNewProjectWizard(): void {
        this.wizardProjectName = '';
        this.wizardStep = 0;
        this.showWizard = true;
    }
    confirmWizardFinish(): void {
        let name = this.wizardProjectName.trim().replace(/[\\/:*?"<>|]/g, '_');
        if (name.length === 0) {
            name = 'Untitled';
        }
        this.showWizard = false;
        const scratchOpts: HomeScratchOptions = { projectName: name };
        this.launchScratchWorkspace(scratchOpts);
    }
    private goToPcbEditor(params: HomeLaunchParams): void {
        if (this.launchGuard) {
            return;
        }
        this.launchGuard = true;
        try {
            this.getUIContext().getRouter().replaceUrl({ url: 'pages/PcbPage', params: params })
                .then(() => { this.launchGuard = false; })
                .catch((_e: BusinessError) => {
                this.launchGuard = false;
            });
        }
        catch (_e) {
            this.launchGuard = false;
        }
    }
    /** Getting Started：PCB 布局工作区 */
    openPcbLayout(): void {
        const app = AppService.getInstance();
        if (app.currentProject !== null) {
            this.goToPcbEditor({ launchMode: 'resume' });
            return;
        }
        this.goToPcbEditor({ launchMode: 'scratch', persistProject: false });
    }
    /** Getting Started：空白原理图工作区（不写盘） */
    openBlankSchematic(): void {
        this.launchScratchWorkspace();
    }
    /** Getting Started：打开仿真侧栏；空工程不自动落盘 */
    openSimulation(): void {
        const scratchOpts: HomeScratchOptions = {
            autoStartSim: false,
            openRightTab: 1,
            expandRightPanel: true
        };
        this.launchScratchWorkspace(scratchOpts);
    }
    /** Help Home：说明 + 可选进入教学面板（仍不写盘） */
    openHelpHome(): void {
        this.openHelpDialog('Help Home', HELP_HOME_TEXT, '打开教学面板', () => {
            const scratchOpts: HomeScratchOptions = { openRightTab: 6, expandRightPanel: true };
            this.launchScratchWorkspace(scratchOpts);
        });
    }
    openHelpTopicSchematic(): void {
        this.openHelpDialog('Schematic Capture', HELP_SCHEMATIC_TEXT);
    }
    openHelpTopicSimulation(): void {
        this.openHelpDialog('Simulation', HELP_SIMULATION_TEXT);
    }
    openHelpTopicPcb(): void {
        this.openHelpDialog('PCB Layout', HELP_PCB_TEXT, '打开 PCB 编辑器', () => {
            this.openPcbLayout();
        });
    }
    openHelpTopicVisualDesigner(): void {
        this.openHelpDialog('Visual Designer', HELP_VISUAL_DESIGNER_TEXT);
    }
    openFlowchartUnavailable(): void {
        this.openHelpDialog('New Flowchart', 'Flowchart 模块尚未在本版本中提供。\n\n请使用 Schematic Capture 绘制原理图。');
    }
    openMigrationGuide(): void {
        this.showMigrationGuide = true;
    }
    focusWhatsNew(): void {
        this.newsHighlight = true;
        if (this.newsHighlightTimer >= 0) {
            clearTimeout(this.newsHighlightTimer);
        }
        this.newsHighlightTimer = setTimeout(() => {
            this.newsHighlight = false;
            this.newsHighlightTimer = -1;
        }, 2800);
    }
    openSampleList(): void {
        this.showSamples = true;
        this.selectedPath = this.sampleEntries.length > 0 ? this.sampleEntries[0].path : '';
    }
    backToRecentList(): void {
        this.showSamples = false;
        this.selectedPath = this.recentEntries.length > 0 ? this.recentEntries[0].path : '';
    }
    private handleNewsAction(item: ProteusHomeNewsItem): void {
        if (item.actionLabel === 'In Use') {
            return;
        }
        if (item.actionLabel === 'Open') {
            this.openSampleList();
            return;
        }
        if (item.actionLabel === 'Download') {
            this.openHelpDialog('Software Updates', UPDATES_INFO_TEXT);
        }
    }
    private canOpenSelected(): boolean {
        if (this.selectedPath.length === 0) {
            return false;
        }
        return this.fileExists(this.selectedPath);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
            Stack.expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
        }, Stack);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeBackdrop(this, {
                        content: () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Column.create();
                                Column.width('100%');
                                Column.height('100%');
                                Column.key(`home89_${this.themeRev}`);
                            }, Column);
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusHomeTopBar(this, {
                                            titleLine: 'Schematic & Simulation Suite',
                                            versionLabel: `Version ${APP_VERSION_NAME}`
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 505, col: 11 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                titleLine: 'Schematic & Simulation Suite',
                                                versionLabel: `Version ${APP_VERSION_NAME}`
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            titleLine: 'Schematic & Simulation Suite',
                                            versionLabel: `Version ${APP_VERSION_NAME}`
                                        });
                                    }
                                }, { name: "ProteusHomeTopBar" });
                            }
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Row.create();
                                Row.layoutWeight(1);
                                Row.width('100%');
                                Row.padding(8);
                                Row.backgroundColor(ProteusHomeColors.WORKSPACE);
                            }, Row);
                            this.LeftSidebar.bind(this)();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Column.create();
                                Column.width(1);
                                Column.height('100%');
                                Column.backgroundColor(ProteusHomeColors.PANEL_BORDER);
                            }, Column);
                            Column.pop();
                            this.RightWorkspace.bind(this)();
                            Row.pop();
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusHomeBottomStrip(this, { statusLine: this.aboutInfo.platformLine }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 523, col: 11 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                statusLine: this.aboutInfo.platformLine
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            statusLine: this.aboutInfo.platformLine
                                        });
                                    }
                                }, { name: "ProteusHomeBottomStrip" });
                            }
                            Column.pop();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 503, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            content: () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create();
                                    Column.width('100%');
                                    Column.height('100%');
                                    Column.key(`home89_${this.themeRev}`);
                                }, Column);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusHomeTopBar(this, {
                                                titleLine: 'Schematic & Simulation Suite',
                                                versionLabel: `Version ${APP_VERSION_NAME}`
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 505, col: 11 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    titleLine: 'Schematic & Simulation Suite',
                                                    versionLabel: `Version ${APP_VERSION_NAME}`
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                titleLine: 'Schematic & Simulation Suite',
                                                versionLabel: `Version ${APP_VERSION_NAME}`
                                            });
                                        }
                                    }, { name: "ProteusHomeTopBar" });
                                }
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create();
                                    Row.layoutWeight(1);
                                    Row.width('100%');
                                    Row.padding(8);
                                    Row.backgroundColor(ProteusHomeColors.WORKSPACE);
                                }, Row);
                                this.LeftSidebar.bind(this)();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create();
                                    Column.width(1);
                                    Column.height('100%');
                                    Column.backgroundColor(ProteusHomeColors.PANEL_BORDER);
                                }, Column);
                                Column.pop();
                                this.RightWorkspace.bind(this)();
                                Row.pop();
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusHomeBottomStrip(this, { statusLine: this.aboutInfo.platformLine }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 523, col: 11 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    statusLine: this.aboutInfo.platformLine
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                statusLine: this.aboutInfo.platformLine
                                            });
                                        }
                                    }, { name: "ProteusHomeBottomStrip" });
                                }
                                Column.pop();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {});
                }
            }, { name: "ProteusHomeBackdrop" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showWizard) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeWizardDialog(this, {
                                    step: this.wizardStep,
                                    projectName: this.wizardProjectName,
                                    projectDir: this.userProjectDir,
                                    onNameChange: (v: string) => { this.wizardProjectName = v; },
                                    onCancel: () => { this.showWizard = false; },
                                    onBack: () => { this.wizardStep = 0; },
                                    onNext: () => { this.wizardStep = 1; },
                                    onFinish: () => { this.confirmWizardFinish(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 531, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        step: this.wizardStep,
                                        projectName: this.wizardProjectName,
                                        projectDir: this.userProjectDir,
                                        onNameChange: (v: string) => { this.wizardProjectName = v; },
                                        onCancel: () => { this.showWizard = false; },
                                        onBack: () => { this.wizardStep = 0; },
                                        onNext: () => { this.wizardStep = 1; },
                                        onFinish: () => { this.confirmWizardFinish(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    step: this.wizardStep,
                                    projectName: this.wizardProjectName,
                                    projectDir: this.userProjectDir
                                });
                            }
                        }, { name: "ProteusHomeWizardDialog" });
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
            if (this.showMigrationGuide) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeTextDialog(this, {
                                    title: 'Migration Guide',
                                    body: MIGRATION_GUIDE_TEXT,
                                    onClose: () => { this.showMigrationGuide = false; }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 544, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        title: 'Migration Guide',
                                        body: MIGRATION_GUIDE_TEXT,
                                        onClose: () => { this.showMigrationGuide = false; }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    title: 'Migration Guide',
                                    body: MIGRATION_GUIDE_TEXT
                                });
                            }
                        }, { name: "ProteusHomeTextDialog" });
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
            if (this.showHelpDialog) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeHelpDialog(this, {
                                    title: this.helpDialogTitle,
                                    body: this.helpDialogBody,
                                    primaryLabel: this.helpDialogPrimaryLabel,
                                    onPrimary: () => { this.runHelpDialogPrimary(); },
                                    onClose: () => { this.closeHelpDialog(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 552, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        title: this.helpDialogTitle,
                                        body: this.helpDialogBody,
                                        primaryLabel: this.helpDialogPrimaryLabel,
                                        onPrimary: () => { this.runHelpDialogPrimary(); },
                                        onClose: () => { this.closeHelpDialog(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    title: this.helpDialogTitle,
                                    body: this.helpDialogBody,
                                    primaryLabel: this.helpDialogPrimaryLabel
                                });
                            }
                        }, { name: "ProteusHomeHelpDialog" });
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
    LeftSidebar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('21%');
            Column.height('100%');
            Column.backgroundColor(ProteusHomeColors.SIDEBAR_BG);
            Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
            Column.clip(true);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionTitle(this, { title: 'Getting Started' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 569, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Getting Started'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Getting Started'
                    });
                }
            }, { name: "ProteusHomeSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ top: 2, bottom: 4 });
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Schematic Capture', onAction: () => this.openBlankSchematic() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 571, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Schematic Capture',
                            onAction: () => this.openBlankSchematic()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Schematic Capture'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'PCB Layout', onAction: () => { this.openPcbLayout(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 572, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'PCB Layout',
                            onAction: () => { this.openPcbLayout(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'PCB Layout'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Simulation', onAction: () => this.openSimulation() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 573, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Simulation',
                            onAction: () => this.openSimulation()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Simulation'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Migration Guide', onAction: () => this.openMigrationGuide() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 574, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Migration Guide',
                            onAction: () => this.openMigrationGuide()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Migration Guide'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'What\'s New', onAction: () => this.focusWhatsNew() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 575, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'What\'s New',
                            onAction: () => this.focusWhatsNew()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'What\'s New'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        Column.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 581, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {};
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {});
                }
            }, { name: "ProteusHomeSectionDivider" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionTitle(this, { title: 'Help' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 582, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Help'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Help'
                    });
                }
            }, { name: "ProteusHomeSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ top: 2, bottom: 4 });
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Help Home', onAction: () => this.openHelpHome() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 584, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Help Home',
                            onAction: () => this.openHelpHome()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Help Home'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Schematic Capture', onAction: () => this.openHelpTopicSchematic() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 585, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Schematic Capture',
                            onAction: () => this.openHelpTopicSchematic()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Schematic Capture'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'PCB Layout', onAction: () => { this.openPcbLayout(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 586, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'PCB Layout',
                            onAction: () => { this.openPcbLayout(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'PCB Layout'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Simulation', onAction: () => this.openHelpTopicSimulation() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 587, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Simulation',
                            onAction: () => this.openHelpTopicSimulation()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Simulation'
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Visual Designer', tabEnabled: false, onAction: () => { this.openHelpTopicVisualDesigner(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 588, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Visual Designer',
                            tabEnabled: false,
                            onAction: () => { this.openHelpTopicVisualDesigner(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Visual Designer', tabEnabled: false
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        Column.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 594, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {};
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {});
                }
            }, { name: "ProteusHomeSectionDivider" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionTitle(this, { title: 'About' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 595, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'About'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'About'
                    });
                }
            }, { name: "ProteusHomeSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.layoutWeight(1);
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`© ${this.aboutInfo.copyrightLine}`);
            Text.fontSize(8);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.margin({ top: 6, bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.aboutInfo.releaseLine);
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.TEXT);
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.aboutInfo.websiteLine);
            Text.fontSize(8);
            Text.fontColor(ProteusHomeColors.LINK);
            Text.decoration({ type: TextDecorationType.Underline, color: ProteusHomeColors.LINK });
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.margin({ top: 2, bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ top: 2, bottom: 4 });
            Column.border({ width: 1, color: ProteusHomeColors.ROW_BORDER });
            Column.margin({ left: 6, right: 6 });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeAboutRow(this, {
                        label: 'Registered To',
                        value: this.aboutInfo.registeredToLine,
                        warn: this.aboutInfo.isEvaluation
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 617, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Registered To',
                            value: this.aboutInfo.registeredToLine,
                            warn: this.aboutInfo.isEvaluation
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Registered To',
                        value: this.aboutInfo.registeredToLine,
                        warn: this.aboutInfo.isEvaluation
                    });
                }
            }, { name: "ProteusHomeAboutRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeAboutRow(this, {
                        label: 'Customer No.',
                        value: this.aboutInfo.customerNumberLine,
                        warn: this.aboutInfo.isEvaluation
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 622, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Customer No.',
                            value: this.aboutInfo.customerNumberLine,
                            warn: this.aboutInfo.isEvaluation
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Customer No.',
                        value: this.aboutInfo.customerNumberLine,
                        warn: this.aboutInfo.isEvaluation
                    });
                }
            }, { name: "ProteusHomeAboutRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeAboutRow(this, {
                        label: 'Licence Expires',
                        value: this.aboutInfo.licenseExpiresLine,
                        warn: this.aboutInfo.isEvaluation
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 627, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Licence Expires',
                            value: this.aboutInfo.licenseExpiresLine,
                            warn: this.aboutInfo.isEvaluation
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Licence Expires',
                        value: this.aboutInfo.licenseExpiresLine,
                        warn: this.aboutInfo.isEvaluation
                    });
                }
            }, { name: "ProteusHomeAboutRow" });
        }
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`Free Memory: ${this.aboutInfo.freeMemoryLine}`);
            Text.fontSize(8);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width('100%');
            Text.padding({ left: 8, bottom: 6 });
        }, Text);
        Text.pop();
        Column.pop();
        Column.pop();
    }
    StartToolbar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, top: 6, bottom: 4 });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeInlineLink(this, { label: 'Open Project', onAction: () => { void this.handleOpenProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 659, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Open Project',
                            onAction: () => { void this.handleOpenProject(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Open Project'
                    });
                }
            }, { name: "ProteusHomeInlineLink" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(' | ');
            Text.fontSize(10);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeInlineLink(this, { label: 'New Project', onAction: () => this.startNewProjectWizard() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 663, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'New Project',
                            onAction: () => this.startNewProjectWizard()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'New Project'
                    });
                }
            }, { name: "ProteusHomeInlineLink" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(' | ');
            Text.fontSize(10);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeInlineLink(this, { label: 'New Flowchart', onAction: () => { this.openFlowchartUnavailable(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 667, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'New Flowchart',
                            onAction: () => { this.openFlowchartUnavailable(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'New Flowchart'
                    });
                }
            }, { name: "ProteusHomeInlineLink" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(' | ');
            Text.fontSize(10);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeInlineLink(this, { label: 'Open Sample Design', onAction: () => this.openSampleList() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 671, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Open Sample Design',
                            onAction: () => this.openSampleList()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Open Sample Design'
                    });
                }
            }, { name: "ProteusHomeInlineLink" });
        }
        Row.pop();
    }
    RightWorkspace(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.layoutWeight(1);
            Column.height('100%');
            Column.margin({ left: 6 });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomePanel(this, {
                        title: 'Start', panelWeight: 6,
                        body: () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Column.create();
                                Column.width('100%');
                                Column.height('100%');
                                Column.alignItems(HorizontalAlign.Start);
                            }, Column);
                            this.StartToolbar.bind(this)();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                If.create();
                                if (this.showSamples) {
                                    this.ifElseBranchUpdateFunction(0, () => {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Row.create();
                                            Row.width('100%');
                                            Row.padding({ left: 8, bottom: 2 });
                                        }, Row);
                                        {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                if (isInitialRender) {
                                                    let componentCall = new ProteusHomeInlineLink(this, {
                                                        label: 'Back to Recent Projects',
                                                        onAction: () => this.backToRecentList()
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 687, col: 15 });
                                                    ViewPU.create(componentCall);
                                                    let paramsLambda = () => {
                                                        return {
                                                            label: 'Back to Recent Projects',
                                                            onAction: () => this.backToRecentList()
                                                        };
                                                    };
                                                    componentCall.paramsGenerator_ = paramsLambda;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                                        label: 'Back to Recent Projects'
                                                    });
                                                }
                                            }, { name: "ProteusHomeInlineLink" });
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
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create(this.showSamples ? 'Sample Projects' : 'Recent Projects');
                                Text.fontSize(10);
                                Text.fontColor(ProteusHomeColors.TEXT);
                                Text.fontWeight(FontWeight.Bold);
                                Text.width('100%');
                                Text.padding({ left: 8, bottom: 2 });
                            }, Text);
                            Text.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Column.create();
                                Column.width('100%');
                                Column.layoutWeight(1);
                                Column.margin({ left: 8, right: 8, bottom: 4 });
                                Column.backgroundColor(ProteusHomeColors.PANEL_BG);
                                Column.border({ width: 1, color: ProteusHomeColors.LISTBOX_BORDER });
                            }, Column);
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                If.create();
                                if (!this.ready) {
                                    this.ifElseBranchUpdateFunction(0, () => {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Text.create('Loading…');
                                            Text.fontSize(10);
                                            Text.fontColor(ProteusHomeColors.TEXT_DIM);
                                            Text.padding(8);
                                        }, Text);
                                        Text.pop();
                                    });
                                }
                                else if (this.listEntries().length === 0) {
                                    this.ifElseBranchUpdateFunction(1, () => {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Column.create();
                                            Column.width('100%');
                                            Column.padding(8);
                                            Column.alignItems(HorizontalAlign.Start);
                                        }, Column);
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Text.create(this.showSamples ? '(no samples)' : '(no recent projects)');
                                            Text.fontSize(10);
                                            Text.fontColor(ProteusHomeColors.TEXT_DIM);
                                        }, Text);
                                        Text.pop();
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            If.create();
                                            if (!this.showSamples) {
                                                this.ifElseBranchUpdateFunction(0, () => {
                                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                        __Common__.create();
                                                        __Common__.margin({ top: 4 });
                                                    }, __Common__);
                                                    {
                                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                            if (isInitialRender) {
                                                                let componentCall = new ProteusHomeInlineLink(this, {
                                                                    label: 'New Project…',
                                                                    onAction: () => this.startNewProjectWizard()
                                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 715, col: 19 });
                                                                ViewPU.create(componentCall);
                                                                let paramsLambda = () => {
                                                                    return {
                                                                        label: 'New Project…',
                                                                        onAction: () => this.startNewProjectWizard()
                                                                    };
                                                                };
                                                                componentCall.paramsGenerator_ = paramsLambda;
                                                            }
                                                            else {
                                                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                                                    label: 'New Project…'
                                                                });
                                                            }
                                                        }, { name: "ProteusHomeInlineLink" });
                                                    }
                                                    __Common__.pop();
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
                                    this.ifElseBranchUpdateFunction(2, () => {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Scroll.create();
                                            Scroll.width('100%');
                                            Scroll.layoutWeight(1);
                                            Scroll.scrollBar(BarState.Auto);
                                        }, Scroll);
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            Column.create();
                                            Column.width('100%');
                                        }, Column);
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            ForEach.create();
                                            const forEachItemGenFunction = _item => {
                                                const e = _item;
                                                {
                                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                        if (isInitialRender) {
                                                            let componentCall = new ProteusHomeRecentRow(this, {
                                                                name: e.name,
                                                                selected: this.selectedPath === e.path,
                                                                warn: e.isRecovery,
                                                                onSelect: () => { this.selectedPath = e.path; },
                                                                onOpen: () => { this.openProjectPath(e.path, e.isRecovery); }
                                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 729, col: 21 });
                                                            ViewPU.create(componentCall);
                                                            let paramsLambda = () => {
                                                                return {
                                                                    name: e.name,
                                                                    selected: this.selectedPath === e.path,
                                                                    warn: e.isRecovery,
                                                                    onSelect: () => { this.selectedPath = e.path; },
                                                                    onOpen: () => { this.openProjectPath(e.path, e.isRecovery); }
                                                                };
                                                            };
                                                            componentCall.paramsGenerator_ = paramsLambda;
                                                        }
                                                        else {
                                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                                name: e.name,
                                                                selected: this.selectedPath === e.path,
                                                                warn: e.isRecovery
                                                            });
                                                        }
                                                    }, { name: "ProteusHomeRecentRow" });
                                                }
                                            };
                                            this.forEachUpdateFunction(elmtId, this.listEntries(), forEachItemGenFunction, (e: HomeProjectEntry) => `${this.showSamples}_${e.path}`, false, false);
                                        }, ForEach);
                                        ForEach.pop();
                                        Column.pop();
                                        Scroll.pop();
                                    });
                                }
                            }, If);
                            If.pop();
                            Column.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Row.create();
                                Row.width('100%');
                                Row.padding({ left: 8, right: 8, bottom: 8 });
                            }, Row);
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusHomeDownloadBtn(this, {
                                            label: 'Open',
                                            primary: true,
                                            btnEnabled: this.canOpenSelected(),
                                            onAction: () => this.openSelected()
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 752, col: 13 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                label: 'Open',
                                                primary: true,
                                                btnEnabled: this.canOpenSelected(),
                                                onAction: () => this.openSelected()
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            label: 'Open',
                                            primary: true,
                                            btnEnabled: this.canOpenSelected()
                                        });
                                    }
                                }, { name: "ProteusHomeDownloadBtn" });
                            }
                            Row.pop();
                            Column.pop();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 681, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Start',
                            panelWeight: 6,
                            body: () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create();
                                    Column.width('100%');
                                    Column.height('100%');
                                    Column.alignItems(HorizontalAlign.Start);
                                }, Column);
                                this.StartToolbar.bind(this)();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    If.create();
                                    if (this.showSamples) {
                                        this.ifElseBranchUpdateFunction(0, () => {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                Row.create();
                                                Row.width('100%');
                                                Row.padding({ left: 8, bottom: 2 });
                                            }, Row);
                                            {
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    if (isInitialRender) {
                                                        let componentCall = new ProteusHomeInlineLink(this, {
                                                            label: 'Back to Recent Projects',
                                                            onAction: () => this.backToRecentList()
                                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 687, col: 15 });
                                                        ViewPU.create(componentCall);
                                                        let paramsLambda = () => {
                                                            return {
                                                                label: 'Back to Recent Projects',
                                                                onAction: () => this.backToRecentList()
                                                            };
                                                        };
                                                        componentCall.paramsGenerator_ = paramsLambda;
                                                    }
                                                    else {
                                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                                            label: 'Back to Recent Projects'
                                                        });
                                                    }
                                                }, { name: "ProteusHomeInlineLink" });
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
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create(this.showSamples ? 'Sample Projects' : 'Recent Projects');
                                    Text.fontSize(10);
                                    Text.fontColor(ProteusHomeColors.TEXT);
                                    Text.fontWeight(FontWeight.Bold);
                                    Text.width('100%');
                                    Text.padding({ left: 8, bottom: 2 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create();
                                    Column.width('100%');
                                    Column.layoutWeight(1);
                                    Column.margin({ left: 8, right: 8, bottom: 4 });
                                    Column.backgroundColor(ProteusHomeColors.PANEL_BG);
                                    Column.border({ width: 1, color: ProteusHomeColors.LISTBOX_BORDER });
                                }, Column);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    If.create();
                                    if (!this.ready) {
                                        this.ifElseBranchUpdateFunction(0, () => {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                Text.create('Loading…');
                                                Text.fontSize(10);
                                                Text.fontColor(ProteusHomeColors.TEXT_DIM);
                                                Text.padding(8);
                                            }, Text);
                                            Text.pop();
                                        });
                                    }
                                    else if (this.listEntries().length === 0) {
                                        this.ifElseBranchUpdateFunction(1, () => {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                Column.create();
                                                Column.width('100%');
                                                Column.padding(8);
                                                Column.alignItems(HorizontalAlign.Start);
                                            }, Column);
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                Text.create(this.showSamples ? '(no samples)' : '(no recent projects)');
                                                Text.fontSize(10);
                                                Text.fontColor(ProteusHomeColors.TEXT_DIM);
                                            }, Text);
                                            Text.pop();
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                If.create();
                                                if (!this.showSamples) {
                                                    this.ifElseBranchUpdateFunction(0, () => {
                                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                            __Common__.create();
                                                            __Common__.margin({ top: 4 });
                                                        }, __Common__);
                                                        {
                                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                                if (isInitialRender) {
                                                                    let componentCall = new ProteusHomeInlineLink(this, {
                                                                        label: 'New Project…',
                                                                        onAction: () => this.startNewProjectWizard()
                                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 715, col: 19 });
                                                                    ViewPU.create(componentCall);
                                                                    let paramsLambda = () => {
                                                                        return {
                                                                            label: 'New Project…',
                                                                            onAction: () => this.startNewProjectWizard()
                                                                        };
                                                                    };
                                                                    componentCall.paramsGenerator_ = paramsLambda;
                                                                }
                                                                else {
                                                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                                                        label: 'New Project…'
                                                                    });
                                                                }
                                                            }, { name: "ProteusHomeInlineLink" });
                                                        }
                                                        __Common__.pop();
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
                                        this.ifElseBranchUpdateFunction(2, () => {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                Scroll.create();
                                                Scroll.width('100%');
                                                Scroll.layoutWeight(1);
                                                Scroll.scrollBar(BarState.Auto);
                                            }, Scroll);
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                Column.create();
                                                Column.width('100%');
                                            }, Column);
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                ForEach.create();
                                                const forEachItemGenFunction = _item => {
                                                    const e = _item;
                                                    {
                                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                            if (isInitialRender) {
                                                                let componentCall = new ProteusHomeRecentRow(this, {
                                                                    name: e.name,
                                                                    selected: this.selectedPath === e.path,
                                                                    warn: e.isRecovery,
                                                                    onSelect: () => { this.selectedPath = e.path; },
                                                                    onOpen: () => { this.openProjectPath(e.path, e.isRecovery); }
                                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 729, col: 21 });
                                                                ViewPU.create(componentCall);
                                                                let paramsLambda = () => {
                                                                    return {
                                                                        name: e.name,
                                                                        selected: this.selectedPath === e.path,
                                                                        warn: e.isRecovery,
                                                                        onSelect: () => { this.selectedPath = e.path; },
                                                                        onOpen: () => { this.openProjectPath(e.path, e.isRecovery); }
                                                                    };
                                                                };
                                                                componentCall.paramsGenerator_ = paramsLambda;
                                                            }
                                                            else {
                                                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                                                    name: e.name,
                                                                    selected: this.selectedPath === e.path,
                                                                    warn: e.isRecovery
                                                                });
                                                            }
                                                        }, { name: "ProteusHomeRecentRow" });
                                                    }
                                                };
                                                this.forEachUpdateFunction(elmtId, this.listEntries(), forEachItemGenFunction, (e: HomeProjectEntry) => `${this.showSamples}_${e.path}`, false, false);
                                            }, ForEach);
                                            ForEach.pop();
                                            Column.pop();
                                            Scroll.pop();
                                        });
                                    }
                                }, If);
                                If.pop();
                                Column.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create();
                                    Row.width('100%');
                                    Row.padding({ left: 8, right: 8, bottom: 8 });
                                }, Row);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new ProteusHomeDownloadBtn(this, {
                                                label: 'Open',
                                                primary: true,
                                                btnEnabled: this.canOpenSelected(),
                                                onAction: () => this.openSelected()
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 752, col: 13 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    label: 'Open',
                                                    primary: true,
                                                    btnEnabled: this.canOpenSelected(),
                                                    onAction: () => this.openSelected()
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                label: 'Open',
                                                primary: true,
                                                btnEnabled: this.canOpenSelected()
                                            });
                                        }
                                    }, { name: "ProteusHomeDownloadBtn" });
                                }
                                Row.pop();
                                Column.pop();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Start', panelWeight: 6
                    });
                }
            }, { name: "ProteusHomePanel" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomePanel(this, {
                        title: 'News', panelWeight: 4, highlighted: this.newsHighlight,
                        body: () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Column.create();
                                Column.width('100%');
                                Column.height('100%');
                                Column.alignItems(HorizontalAlign.Start);
                            }, Column);
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Row.create();
                                Row.width('100%');
                                Row.height(20);
                                Row.alignItems(VerticalAlign.Center);
                                Row.backgroundColor(ProteusHomeColors.TABLE_HEAD_BG);
                                Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.ROW_BORDER });
                            }, Row);
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('Description');
                                Text.fontSize(9);
                                Text.fontColor(ProteusHomeColors.TEXT);
                                Text.fontWeight(FontWeight.Bold);
                                Text.layoutWeight(1);
                                Text.padding({ left: 4 });
                            }, Text);
                            Text.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('Date');
                                Text.fontSize(9);
                                Text.fontColor(ProteusHomeColors.TEXT);
                                Text.fontWeight(FontWeight.Bold);
                                Text.width(68);
                                Text.textAlign(TextAlign.Center);
                            }, Text);
                            Text.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('Valid');
                                Text.fontSize(9);
                                Text.fontColor(ProteusHomeColors.TEXT);
                                Text.fontWeight(FontWeight.Bold);
                                Text.width(36);
                                Text.textAlign(TextAlign.Center);
                            }, Text);
                            Text.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Blank.create();
                                Blank.width(68);
                            }, Blank);
                            Blank.pop();
                            Row.pop();
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
                                ForEach.create();
                                const forEachItemGenFunction = _item => {
                                    const item = _item;
                                    {
                                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                                            if (isInitialRender) {
                                                let componentCall = new ProteusHomeNewsRow(this, {
                                                    description: item.description,
                                                    releaseDate: item.releaseDate,
                                                    uscValid: item.uscValid,
                                                    actionLabel: item.actionLabel,
                                                    isCurrent: item.actionLabel === 'In Use',
                                                    showButton: item.actionLabel !== 'In Use',
                                                    onAction: () => { this.handleNewsAction(item); }
                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 799, col: 17 });
                                                ViewPU.create(componentCall);
                                                let paramsLambda = () => {
                                                    return {
                                                        description: item.description,
                                                        releaseDate: item.releaseDate,
                                                        uscValid: item.uscValid,
                                                        actionLabel: item.actionLabel,
                                                        isCurrent: item.actionLabel === 'In Use',
                                                        showButton: item.actionLabel !== 'In Use',
                                                        onAction: () => { this.handleNewsAction(item); }
                                                    };
                                                };
                                                componentCall.paramsGenerator_ = paramsLambda;
                                            }
                                            else {
                                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                                    description: item.description,
                                                    releaseDate: item.releaseDate,
                                                    uscValid: item.uscValid,
                                                    actionLabel: item.actionLabel,
                                                    isCurrent: item.actionLabel === 'In Use',
                                                    showButton: item.actionLabel !== 'In Use'
                                                });
                                            }
                                        }, { name: "ProteusHomeNewsRow" });
                                    }
                                };
                                this.forEachUpdateFunction(elmtId, this.newsItems, forEachItemGenFunction, (item: ProteusHomeNewsItem, idx: number) => `n_${idx}`, false, true);
                            }, ForEach);
                            ForEach.pop();
                            Column.pop();
                            Scroll.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Row.create();
                                Row.width('100%');
                                Row.padding({ left: 8, top: 4, bottom: 6 });
                                Row.alignItems(VerticalAlign.Center);
                            }, Row);
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Toggle.create({ type: ToggleType.Checkbox, isOn: this.ignoreBeta });
                                Toggle.width(13);
                                Toggle.height(13);
                                Toggle.margin({ right: 4 });
                                Toggle.onChange((on: boolean) => { this.ignoreBeta = on; });
                            }, Toggle);
                            Toggle.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('Ignore beta version updates');
                                Text.fontSize(9);
                                Text.fontColor(ProteusHomeColors.TEXT_DIM);
                            }, Text);
                            Text.pop();
                            Row.pop();
                            Column.pop();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 767, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'News',
                            panelWeight: 4,
                            highlighted: this.newsHighlight,
                            body: () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Column.create();
                                    Column.width('100%');
                                    Column.height('100%');
                                    Column.alignItems(HorizontalAlign.Start);
                                }, Column);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create();
                                    Row.width('100%');
                                    Row.height(20);
                                    Row.alignItems(VerticalAlign.Center);
                                    Row.backgroundColor(ProteusHomeColors.TABLE_HEAD_BG);
                                    Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.ROW_BORDER });
                                }, Row);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('Description');
                                    Text.fontSize(9);
                                    Text.fontColor(ProteusHomeColors.TEXT);
                                    Text.fontWeight(FontWeight.Bold);
                                    Text.layoutWeight(1);
                                    Text.padding({ left: 4 });
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('Date');
                                    Text.fontSize(9);
                                    Text.fontColor(ProteusHomeColors.TEXT);
                                    Text.fontWeight(FontWeight.Bold);
                                    Text.width(68);
                                    Text.textAlign(TextAlign.Center);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('Valid');
                                    Text.fontSize(9);
                                    Text.fontColor(ProteusHomeColors.TEXT);
                                    Text.fontWeight(FontWeight.Bold);
                                    Text.width(36);
                                    Text.textAlign(TextAlign.Center);
                                }, Text);
                                Text.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Blank.create();
                                    Blank.width(68);
                                }, Blank);
                                Blank.pop();
                                Row.pop();
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
                                    ForEach.create();
                                    const forEachItemGenFunction = _item => {
                                        const item = _item;
                                        {
                                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                if (isInitialRender) {
                                                    let componentCall = new ProteusHomeNewsRow(this, {
                                                        description: item.description,
                                                        releaseDate: item.releaseDate,
                                                        uscValid: item.uscValid,
                                                        actionLabel: item.actionLabel,
                                                        isCurrent: item.actionLabel === 'In Use',
                                                        showButton: item.actionLabel !== 'In Use',
                                                        onAction: () => { this.handleNewsAction(item); }
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 799, col: 17 });
                                                    ViewPU.create(componentCall);
                                                    let paramsLambda = () => {
                                                        return {
                                                            description: item.description,
                                                            releaseDate: item.releaseDate,
                                                            uscValid: item.uscValid,
                                                            actionLabel: item.actionLabel,
                                                            isCurrent: item.actionLabel === 'In Use',
                                                            showButton: item.actionLabel !== 'In Use',
                                                            onAction: () => { this.handleNewsAction(item); }
                                                        };
                                                    };
                                                    componentCall.paramsGenerator_ = paramsLambda;
                                                }
                                                else {
                                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                                        description: item.description,
                                                        releaseDate: item.releaseDate,
                                                        uscValid: item.uscValid,
                                                        actionLabel: item.actionLabel,
                                                        isCurrent: item.actionLabel === 'In Use',
                                                        showButton: item.actionLabel !== 'In Use'
                                                    });
                                                }
                                            }, { name: "ProteusHomeNewsRow" });
                                        }
                                    };
                                    this.forEachUpdateFunction(elmtId, this.newsItems, forEachItemGenFunction, (item: ProteusHomeNewsItem, idx: number) => `n_${idx}`, false, true);
                                }, ForEach);
                                ForEach.pop();
                                Column.pop();
                                Scroll.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Row.create();
                                    Row.width('100%');
                                    Row.padding({ left: 8, top: 4, bottom: 6 });
                                    Row.alignItems(VerticalAlign.Center);
                                }, Row);
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Toggle.create({ type: ToggleType.Checkbox, isOn: this.ignoreBeta });
                                    Toggle.width(13);
                                    Toggle.height(13);
                                    Toggle.margin({ right: 4 });
                                    Toggle.onChange((on: boolean) => { this.ignoreBeta = on; });
                                }, Toggle);
                                Toggle.pop();
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    Text.create('Ignore beta version updates');
                                    Text.fontSize(9);
                                    Text.fontColor(ProteusHomeColors.TEXT_DIM);
                                }, Text);
                                Text.pop();
                                Row.pop();
                                Column.pop();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'News', panelWeight: 4, highlighted: this.newsHighlight
                    });
                }
            }, { name: "ProteusHomePanel" });
        }
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
    static getEntryName(): string {
        return "HomePage";
    }
}
registerNamedRoute(() => new HomePage(undefined, {}), "", { bundleName: "com.elecdraw.aischsim", moduleName: "entry", pagePath: "pages/HomePage", pageFullPath: "entry/src/main/ets/pages/HomePage", integratedHsp: "false", moduleType: "followWithHap" });
