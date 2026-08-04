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
    showGitHubUnlock?: boolean;
    githubUserCode?: string;
    githubUnlockStatus?: string;
    githubUnlockBusy?: boolean;
    githubHasToken?: boolean;
    githubBoundLogin?: string;
    githubShowDeviceCode?: boolean;
    announcement?: HomeAnnouncement;
    announcementLoading?: boolean;
    wizardModulesHint?: string;
    wizardWillCreateFile?: boolean;
    helpDialogPrimaryAction?: (() => void) | null;
    githubDeviceCode?: string;
    githubVerifyUri?: string;
    appService?: AppService;
    newsHighlightTimer?: number;
    launchGuard?: boolean;
    wizardLaunchTarget?: string;
}
import type { BusinessError } from "@ohos:base";
import type Want from "@ohos:app.ability.Want";
import type common from "@ohos:app.ability.common";
import picker from "@ohos:file.picker";
import fileUri from "@ohos:file.fileuri";
import fs from "@ohos:file.fs";
import { APP_VERSION_CODE, APP_VERSION_NAME, appVersionLabel, Logger, GitHubDeviceAuth, GitHubOAuthConfig, GitHubStarVerifier, StarCheckKind, LicenseManager, FeatureGate, EventBus, ModuleEvent } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { HomeAnnouncementService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/HomeAnnouncementService";
import type { HomeAnnouncement } from "@bundle:com.elecdraw.aischsim/entry/ets/services/HomeAnnouncementService";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusHomeColors, ProteusHomeDownloadBtn, ProteusHomeIconLink, ProteusHomeInlineLink, ProteusHomePanel, ProteusHomeRecentRow, ProteusHomeTopBar, ProteusHomeWizardDialog, ProteusHomeBottomStrip, ProteusHomeTextDialog, ProteusHomeBackdrop, ProteusHomeAboutRow, ProteusHomeHelpDialog, ProteusHomeSectionTitle, ProteusHomeSectionDivider, ProteusHomeNewsRow, ProteusHomeAnnouncementPanel } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusHomeWidgets";
import type { ProteusHomeNewsItem } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusHomeWidgets";
import { maximizeAppWindow } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/WindowLaunchUtil";
import { ProjectPaths } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/ProjectPaths";
import { collectHomeAboutInfo, defaultHomeAboutSnapshot, HOME_OFFICIAL_WEBSITE_URL } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/HomeAboutInfo";
import type { HomeAboutSnapshot } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/HomeAboutInfo";
import { ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
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
const HELP_HOME_TEXT: string = 'AI-SCH Design Suite 操作手册\n' +
    '================================\n\n' +
    '一、启动与工程管理\n' +
    '----------------\n' +
    '1. 首页左侧 Getting Started（双击进入，须先新建工程文件）\n' +
    '   · PCB Layout：向导命名 → 创建 .pcbsim 并进入 PCB 编辑器\n' +
    '   · Simulation：向导命名 → 创建 .schsim 并进入原理图（展开仿真侧栏）\n\n' +
    '2. 首页 Start 面板（左侧第二栏）\n' +
    '   · Open Project：打开 .schsim / .pcbsim / .json 工程\n' +
    '   · New Project：向导命名后进入未落盘工作区，保存请用 文件 → 保存\n' +
    '   · Open Sample Design：浏览并打开内置 lab_* / Test_Template 教程工程\n' +
    '   · Recent Projects：双击或选中后点 Open 打开最近工程\n\n' +
    '3. 工程文件\n' +
    '   · 原理图：.schsim（JSON 原理图工程）\n' +
    '   · PCB：.pcbsim（PCB 工程，与原理图同目录 project/）\n' +
    '   · Ctrl+N 新建 / Ctrl+O 打开 / Ctrl+S 保存 / 另存为走系统对话框\n' +
    '   · 异常退出后可在最近列表中看到带恢复标记的工程\n\n' +
    '二、原理图绘制\n' +
    '------------\n' +
    '1. 器件放置\n' +
    '   · P：放置模式；从左侧器件库拖放到画布\n' +
    '   · 选中器件后可移动、旋转、删除属性编辑\n\n' +
    '2. 连线与网络\n' +
    '   · W：连线模式，点击引脚/导线端点建立连接\n' +
    '   · 电源与地必须正确放置，否则仿真/ERC 会报错\n\n' +
    '3. 电气规则检查（ERC）\n' +
    '   · F7 或菜单「仿真 → ERC」检查悬空引脚、电源冲突等\n' +
    '   · 建议仿真前先通过 ERC\n\n' +
    '4. 从原理图到 PCB\n' +
    '   · 工具栏 / 工程菜单「导出 PCB」：跳转 PCB 页并将当前原理图同步为 PCB 文件\n' +
    '   · PCB 可用「另存为」保存为 .pcbsim，与 .schsim 区分\n\n' +
    '三、电路仿真（Simulation）\n' +
    '------------------------\n' +
    '1. 启动仿真\n' +
    '   · F5 或工具栏运行/停止仿真\n' +
    '   · Getting Started → Simulation（双击）新建工程后打开仿真侧栏\n\n' +
    '2. 仪器与波形\n' +
    '   · 右侧「仿真 / 仪器」面板：示波器、逻辑分析仪、探针等\n' +
    '   · 放置电源、地及完整网表后再运行\n\n' +
    '3. MCU / 教学实验\n' +
    '   · 右侧「教学」面板：实验模板、步骤说明、MCU 实验入口\n' +
    '   · Start → Open Sample 可打开 lab_* 教程工程\n' +
    '   · 本对话框下方「打开教学面板」进入教学侧栏（不写盘）\n\n' +
    '四、PCB 布局（PCB Layout）\n' +
    '------------------------\n' +
    '1. 进入方式\n' +
    '   · Getting Started → PCB Layout（双击新建），或原理图「导出 PCB」后跳转\n\n' +
    '2. 常用操作\n' +
    '   · 选择 / 移动 / 旋转封装\n' +
    '   · 走线、过孔工具布线\n' +
    '   · 左侧图层面板开关各层显示\n' +
    '   · 右侧执行 DRC（设计规则检查）\n\n' +
    '3. 与原理图联动\n' +
    '   · 网络与封装来自原理图同步；修改后请保存工程\n\n' +
    '五、界面与面板\n' +
    '------------\n' +
    '· 左侧：器件库 / 图层等（随当前编辑器变化）\n' +
    '· 中间：原理图或 PCB 画布\n' +
    '· 右侧：属性、仿真、仪器、教学、AI 设置等页签\n' +
    '· 底栏：状态与平台信息\n\n' +
    '六、常用快捷键\n' +
    '------------\n' +
    '· Ctrl+N / Ctrl+O / Ctrl+S — 新建 / 打开 / 保存\n' +
    '· W — 连线    · P — 放置器件\n' +
    '· F5 — 运行/停止仿真    · F7 — ERC\n' +
    '· Delete — 删除选中对象\n\n' +
    '七、从其他 EDA 迁移\n' +
    '----------------\n' +
    '· 本软件使用 .schsim；通过 文件 → 打开 或 Start → Open Sample 开始\n' +
    '· 内置 DeviceLibrary 与 proteus_alias.json 别名映射\n' +
    '· 放置器件后使用 ERC 检查，再运行仿真验证\n\n' +
    '八、版本与支持\n' +
    '------------\n' +
    '· 版本号见首页顶栏与 About 区域\n' +
    '· Announcement panel on the right can show server-pushed image + text notices\n' +
    '· 更多教程：Start → Open Sample 或右侧教学面板\n';
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
        this.__showGitHubUnlock = new ObservedPropertySimplePU(false, this, "showGitHubUnlock");
        this.__githubUserCode = new ObservedPropertySimplePU('', this, "githubUserCode");
        this.__githubUnlockStatus = new ObservedPropertySimplePU('', this, "githubUnlockStatus");
        this.__githubUnlockBusy = new ObservedPropertySimplePU(false, this, "githubUnlockBusy");
        this.__githubHasToken = new ObservedPropertySimplePU(false, this, "githubHasToken");
        this.__githubBoundLogin = new ObservedPropertySimplePU('', this, "githubBoundLogin");
        this.__githubShowDeviceCode = new ObservedPropertySimplePU(false, this, "githubShowDeviceCode");
        this.__announcement = new ObservedPropertyObjectPU(HomeAnnouncementService.defaultAnnouncement(), this, "announcement");
        this.__announcementLoading = new ObservedPropertySimplePU(false, this, "announcementLoading");
        this.__wizardModulesHint = new ObservedPropertySimplePU('Schematic · Simulation', this, "wizardModulesHint");
        this.__wizardWillCreateFile = new ObservedPropertySimplePU(false, this, "wizardWillCreateFile");
        this.helpDialogPrimaryAction = null;
        this.githubDeviceCode = '';
        this.githubVerifyUri = GitHubOAuthConfig.VERIFICATION_URI_FALLBACK;
        this.appService = AppService.getInstance();
        this.newsHighlightTimer = -1;
        this.launchGuard = false;
        this.wizardLaunchTarget = 'default';
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
        if (params.showGitHubUnlock !== undefined) {
            this.showGitHubUnlock = params.showGitHubUnlock;
        }
        if (params.githubUserCode !== undefined) {
            this.githubUserCode = params.githubUserCode;
        }
        if (params.githubUnlockStatus !== undefined) {
            this.githubUnlockStatus = params.githubUnlockStatus;
        }
        if (params.githubUnlockBusy !== undefined) {
            this.githubUnlockBusy = params.githubUnlockBusy;
        }
        if (params.githubHasToken !== undefined) {
            this.githubHasToken = params.githubHasToken;
        }
        if (params.githubBoundLogin !== undefined) {
            this.githubBoundLogin = params.githubBoundLogin;
        }
        if (params.githubShowDeviceCode !== undefined) {
            this.githubShowDeviceCode = params.githubShowDeviceCode;
        }
        if (params.announcement !== undefined) {
            this.announcement = params.announcement;
        }
        if (params.announcementLoading !== undefined) {
            this.announcementLoading = params.announcementLoading;
        }
        if (params.wizardModulesHint !== undefined) {
            this.wizardModulesHint = params.wizardModulesHint;
        }
        if (params.wizardWillCreateFile !== undefined) {
            this.wizardWillCreateFile = params.wizardWillCreateFile;
        }
        if (params.helpDialogPrimaryAction !== undefined) {
            this.helpDialogPrimaryAction = params.helpDialogPrimaryAction;
        }
        if (params.githubDeviceCode !== undefined) {
            this.githubDeviceCode = params.githubDeviceCode;
        }
        if (params.githubVerifyUri !== undefined) {
            this.githubVerifyUri = params.githubVerifyUri;
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
        if (params.wizardLaunchTarget !== undefined) {
            this.wizardLaunchTarget = params.wizardLaunchTarget;
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
        this.__showGitHubUnlock.purgeDependencyOnElmtId(rmElmtId);
        this.__githubUserCode.purgeDependencyOnElmtId(rmElmtId);
        this.__githubUnlockStatus.purgeDependencyOnElmtId(rmElmtId);
        this.__githubUnlockBusy.purgeDependencyOnElmtId(rmElmtId);
        this.__githubHasToken.purgeDependencyOnElmtId(rmElmtId);
        this.__githubBoundLogin.purgeDependencyOnElmtId(rmElmtId);
        this.__githubShowDeviceCode.purgeDependencyOnElmtId(rmElmtId);
        this.__announcement.purgeDependencyOnElmtId(rmElmtId);
        this.__announcementLoading.purgeDependencyOnElmtId(rmElmtId);
        this.__wizardModulesHint.purgeDependencyOnElmtId(rmElmtId);
        this.__wizardWillCreateFile.purgeDependencyOnElmtId(rmElmtId);
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
        this.__showGitHubUnlock.aboutToBeDeleted();
        this.__githubUserCode.aboutToBeDeleted();
        this.__githubUnlockStatus.aboutToBeDeleted();
        this.__githubUnlockBusy.aboutToBeDeleted();
        this.__githubHasToken.aboutToBeDeleted();
        this.__githubBoundLogin.aboutToBeDeleted();
        this.__githubShowDeviceCode.aboutToBeDeleted();
        this.__announcement.aboutToBeDeleted();
        this.__announcementLoading.aboutToBeDeleted();
        this.__wizardModulesHint.aboutToBeDeleted();
        this.__wizardWillCreateFile.aboutToBeDeleted();
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
    private __showGitHubUnlock: ObservedPropertySimplePU<boolean>;
    get showGitHubUnlock() {
        return this.__showGitHubUnlock.get();
    }
    set showGitHubUnlock(newValue: boolean) {
        this.__showGitHubUnlock.set(newValue);
    }
    private __githubUserCode: ObservedPropertySimplePU<string>;
    get githubUserCode() {
        return this.__githubUserCode.get();
    }
    set githubUserCode(newValue: string) {
        this.__githubUserCode.set(newValue);
    }
    private __githubUnlockStatus: ObservedPropertySimplePU<string>;
    get githubUnlockStatus() {
        return this.__githubUnlockStatus.get();
    }
    set githubUnlockStatus(newValue: string) {
        this.__githubUnlockStatus.set(newValue);
    }
    private __githubUnlockBusy: ObservedPropertySimplePU<boolean>;
    get githubUnlockBusy() {
        return this.__githubUnlockBusy.get();
    }
    set githubUnlockBusy(newValue: boolean) {
        this.__githubUnlockBusy.set(newValue);
    }
    /** 已记住 GitHub 账户（本地有 token） */
    private __githubHasToken: ObservedPropertySimplePU<boolean>;
    get githubHasToken() {
        return this.__githubHasToken.get();
    }
    set githubHasToken(newValue: boolean) {
        this.__githubHasToken.set(newValue);
    }
    private __githubBoundLogin: ObservedPropertySimplePU<string>;
    get githubBoundLogin() {
        return this.__githubBoundLogin.get();
    }
    set githubBoundLogin(newValue: string) {
        this.__githubBoundLogin.set(newValue);
    }
    /** true=正在走 Device Flow（显示设备码区） */
    private __githubShowDeviceCode: ObservedPropertySimplePU<boolean>;
    get githubShowDeviceCode() {
        return this.__githubShowDeviceCode.get();
    }
    set githubShowDeviceCode(newValue: boolean) {
        this.__githubShowDeviceCode.set(newValue);
    }
    private __announcement: ObservedPropertyObjectPU<HomeAnnouncement>;
    get announcement() {
        return this.__announcement.get();
    }
    set announcement(newValue: HomeAnnouncement) {
        this.__announcement.set(newValue);
    }
    private __announcementLoading: ObservedPropertySimplePU<boolean>;
    get announcementLoading() {
        return this.__announcementLoading.get();
    }
    set announcementLoading(newValue: boolean) {
        this.__announcementLoading.set(newValue);
    }
    private __wizardModulesHint: ObservedPropertySimplePU<string>;
    get wizardModulesHint() {
        return this.__wizardModulesHint.get();
    }
    set wizardModulesHint(newValue: string) {
        this.__wizardModulesHint.set(newValue);
    }
    private __wizardWillCreateFile: ObservedPropertySimplePU<boolean>;
    get wizardWillCreateFile() {
        return this.__wizardWillCreateFile.get();
    }
    set wizardWillCreateFile(newValue: boolean) {
        this.__wizardWillCreateFile.set(newValue);
    }
    private helpDialogPrimaryAction: (() => void) | null;
    private githubDeviceCode: string;
    private githubVerifyUri: string;
    private appService: AppService;
    private newsHighlightTimer: number;
    private launchGuard: boolean;
    /** New Project 向导完成后的目标：default | pcb | simulation */
    private wizardLaunchTarget: string;
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
        // 等待记住的 GitHub 账户完成静默 Star 复验，再刷新 About
        await this.appService.waitLicenseBootstrap();
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
        void this.loadAnnouncement();
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
    private async loadAnnouncement(): Promise<void> {
        this.announcementLoading = true;
        try {
            this.announcement = await HomeAnnouncementService.fetchLatest();
            if (this.announcement.id !== 'local-default' &&
                (this.announcement.title.length > 0 || this.announcement.body.length > 0)) {
                Logger.info('HomePage', `Announcement loaded: ${this.announcement.id}`);
            }
        }
        finally {
            this.announcementLoading = false;
        }
    }
    /** About 网址 → 系统浏览器打开官方站 */
    private openOfficialWebsite(): void {
        const raw = (this.aboutInfo.websiteUrl ?? HOME_OFFICIAL_WEBSITE_URL).trim();
        const url = raw.length > 0 ? raw : HOME_OFFICIAL_WEBSITE_URL;
        this.openExternalUrl(url);
    }
    private openExternalUrl(url: string): void {
        try {
            const ctx = getContext(this) as common.UIAbilityContext;
            const want: Want = {
                action: 'ohos.want.action.viewData',
                entities: ['entity.system.browsable'],
                uri: url
            };
            void ctx.startAbility(want).catch((e: BusinessError) => {
                Logger.warn('HomePage', `open url failed: ${e.code} ${e.message}`);
            });
        }
        catch (e) {
            Logger.warn('HomePage', `open url error: ${e}`);
        }
    }
    private openGitHubUnlockDialog(): void {
        this.showGitHubUnlock = true;
        this.githubUnlockStatus = '';
        this.githubUserCode = '';
        this.githubUnlockBusy = false;
        this.githubShowDeviceCode = false;
        void this.prepareGitHubUnlockDialog();
    }
    /** 打开对话框：若已记住账户则直接检测 Star，跳过重新登录 */
    private async prepareGitHubUnlockDialog(): Promise<void> {
        try {
            const ctx = getContext(this) as common.UIAbilityContext;
            await GitHubDeviceAuth.init(ctx);
            const token = await GitHubDeviceAuth.getStoredToken();
            const login = await GitHubDeviceAuth.getStoredLogin();
            this.githubHasToken = token.length > 0;
            this.githubBoundLogin = login;
            if (token.length === 0) {
                this.githubUnlockStatus = '首次使用请授权一次；授权后将记住账户，下次自动检测';
                return;
            }
            this.githubUnlockStatus = login.length > 0
                ? `已记住账户 @${login}，正在检测 Star…`
                : '已记住账户，正在检测 Star…';
            await this.recheckGitHubStar();
            // 检测后刷新绑定显示
            this.githubBoundLogin = await GitHubDeviceAuth.getStoredLogin();
            this.githubHasToken = (await GitHubDeviceAuth.getStoredToken()).length > 0;
        }
        catch (e) {
            this.githubUnlockStatus = `读取账户失败: ${e}`;
            Logger.warn('HomePage', `prepareGitHubUnlock: ${e}`);
        }
    }
    private closeGitHubUnlockDialog(): void {
        GitHubDeviceAuth.cancelPolling();
        this.showGitHubUnlock = false;
        this.githubUnlockBusy = false;
        this.githubShowDeviceCode = false;
    }
    private async startGitHubDeviceFlow(): Promise<void> {
        if (this.githubUnlockBusy) {
            return;
        }
        this.githubUnlockBusy = true;
        this.githubShowDeviceCode = true;
        this.githubUnlockStatus = '正在申请设备码…';
        try {
            const ctx = getContext(this) as common.UIAbilityContext;
            await GitHubDeviceAuth.init(ctx);
            const session = await GitHubDeviceAuth.requestDeviceCode();
            if (session === null) {
                this.githubUnlockStatus = '申请设备码失败。请确认 OAuth App 已 Enable Device Flow，并检查网络。';
                this.githubUnlockBusy = false;
                return;
            }
            this.githubDeviceCode = session.deviceCode;
            this.githubUserCode = session.userCode;
            this.githubVerifyUri = session.verificationUri;
            this.githubUnlockStatus = '请在浏览器输入上方代码并授权，然后 Star 仓库';
            this.openExternalUrl(session.verificationUri);
            const auth = await GitHubDeviceAuth.pollForToken(session, (msg: string) => {
                this.githubUnlockStatus = msg;
            });
            if (!auth.success) {
                this.githubUnlockStatus = auth.error.length > 0 ? auth.error : '授权未完成';
                this.githubUnlockBusy = false;
                return;
            }
            this.githubUnlockStatus = '授权成功，账户已记住，正在检测 Star…';
            const star = await GitHubStarVerifier.activateWithToken(ctx, auth.accessToken);
            this.githubHasToken = true;
            this.githubBoundLogin = star.login.length > 0
                ? star.login
                : await GitHubDeviceAuth.getStoredLogin();
            this.githubShowDeviceCode = false;
            FeatureGate.refresh();
            EventBus.getInstance().publish({
                event: ModuleEvent.LICENSE_CHANGED,
                source: 'entry',
                timestamp: Date.now(),
                data: LicenseManager.getInstance().getStatus()
            });
            this.refreshAboutInfo();
            if (star.kind === StarCheckKind.STARRED) {
                this.githubUnlockStatus = star.message + '（账户已记住，下次启动自动检测）';
                this.githubUnlockBusy = false;
                this.showGitHubUnlock = false;
                return;
            }
            if (star.kind === StarCheckKind.NOT_STARRED) {
                this.githubUnlockStatus = '账户已记住。请 Star 仓库后点「检测 Star」。';
            }
            else {
                this.githubUnlockStatus = star.message;
            }
        }
        catch (e) {
            this.githubUnlockStatus = `解锁失败: ${e}`;
            Logger.warn('HomePage', `device flow: ${e}`);
        }
        this.githubUnlockBusy = false;
    }
    private async recheckGitHubStar(): Promise<void> {
        if (this.githubUnlockBusy) {
            return;
        }
        this.githubUnlockBusy = true;
        this.githubUnlockStatus = this.githubBoundLogin.length > 0
            ? `使用已记住账户 @${this.githubBoundLogin} 检测中…`
            : '正在检测 Star…';
        try {
            const ctx = getContext(this) as common.UIAbilityContext;
            const msg = await this.appService.revalidateGitHubStar(ctx);
            this.githubHasToken = (await GitHubDeviceAuth.getStoredToken()).length > 0;
            this.githubBoundLogin = await GitHubDeviceAuth.getStoredLogin();
            this.refreshAboutInfo();
            this.githubUnlockStatus = msg;
            if (LicenseManager.getInstance().isStarUnlocked()) {
                this.githubUnlockStatus = msg + '（账户已记住）';
                this.showGitHubUnlock = false;
            }
            else if (!this.githubHasToken) {
                this.githubUnlockStatus = '授权已失效，请重新授权一次';
            }
        }
        catch (e) {
            this.githubUnlockStatus = `检测失败: ${e}`;
        }
        this.githubUnlockBusy = false;
    }
    private async clearRememberedGitHubAccount(): Promise<void> {
        if (this.githubUnlockBusy) {
            return;
        }
        try {
            const ctx = getContext(this) as common.UIAbilityContext;
            await GitHubDeviceAuth.init(ctx);
            await GitHubDeviceAuth.clearToken();
            LicenseManager.getInstance().setStarUnlock(false, '');
            FeatureGate.refresh();
            this.githubHasToken = false;
            this.githubBoundLogin = '';
            this.githubUserCode = '';
            this.githubShowDeviceCode = false;
            this.refreshAboutInfo();
            this.githubUnlockStatus = '已清除记住的账户，请重新授权';
        }
        catch (e) {
            this.githubUnlockStatus = `清除失败: ${e}`;
        }
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
                // 与 Recent 一致：名称后附文件后缀，标明原理图/PCB
                entries.push({ path: path, name: e.name, modifiedMs: e.modifiedMs, isRecovery: false });
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
    /** 列表显示名：保留 .schsim / .pcbsim 后缀，便于区分原理图与 PCB */
    private baseName(path: string): string {
        const norm = path.replace(/\\/g, '/');
        const slash = norm.lastIndexOf('/');
        return slash >= 0 ? norm.substring(slash + 1) : norm;
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
        if (ProjectPaths.isPcbProjectPath(path)) {
            this.goToPcbEditor({ launchMode: 'open', projectPath: path });
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
            opt.fileSuffixFilters = ['.schsim', '.pcbsim', '.json'];
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
    startNewProjectWizard(target: string = 'default'): void {
        this.wizardLaunchTarget = target;
        this.wizardProjectName = '';
        this.wizardStep = 0;
        if (target === 'pcb') {
            this.wizardModulesHint = 'PCB Layout';
            this.wizardWillCreateFile = true;
        }
        else if (target === 'simulation') {
            this.wizardModulesHint = 'Schematic · Simulation';
            this.wizardWillCreateFile = true;
        }
        else {
            this.wizardModulesHint = 'Schematic · Simulation';
            this.wizardWillCreateFile = false;
        }
        this.showWizard = true;
    }
    confirmWizardFinish(): void {
        let name = this.wizardProjectName.trim().replace(/[\\/:*?"<>|]/g, '_');
        if (name.length === 0) {
            name = 'Untitled';
        }
        const target = this.wizardLaunchTarget;
        this.wizardLaunchTarget = 'default';
        this.showWizard = false;
        if (target === 'pcb') {
            this.goToPcbEditor({ launchMode: 'new', projectName: name });
            return;
        }
        if (target === 'simulation') {
            this.goToEditor({
                launchMode: 'new',
                projectName: name,
                openRightTab: 1,
                expandRightPanel: true
            });
            return;
        }
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
    /** Getting Started：双击后经新建向导创建 .pcbsim 进入 PCB */
    openPcbLayout(): void {
        this.startNewProjectWizard('pcb');
    }
    /** Getting Started：双击后经新建向导创建 .schsim 并打开仿真侧栏 */
    openSimulation(): void {
        this.startNewProjectWizard('simulation');
    }
    /** Help Home：说明 + 可选进入教学面板（仍不写盘） */
    openHelpHome(): void {
        this.openHelpDialog('Help Home — 操作手册', HELP_HOME_TEXT, '打开教学面板', () => {
            const scratchOpts: HomeScratchOptions = { openRightTab: 6, expandRightPanel: true };
            this.launchScratchWorkspace(scratchOpts);
        });
    }
    openFlowchartUnavailable(): void {
        this.openHelpDialog('New Flowchart', 'Flowchart 模块尚未在本版本中提供。\n\n请使用 Simulation 或打开示例工程绘制原理图。');
    }
    openMigrationGuide(): void {
        this.showMigrationGuide = true;
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 757, col: 11 });
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
                                        let componentCall = new ProteusHomeBottomStrip(this, { statusLine: this.aboutInfo.platformLine }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 775, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 755, col: 7 });
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
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 757, col: 11 });
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
                                            let componentCall = new ProteusHomeBottomStrip(this, { statusLine: this.aboutInfo.platformLine }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 775, col: 11 });
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
                                    modulesHint: this.wizardModulesHint,
                                    willCreateFile: this.wizardWillCreateFile,
                                    onNameChange: (v: string) => { this.wizardProjectName = v; },
                                    onCancel: () => {
                                        this.showWizard = false;
                                        this.wizardLaunchTarget = 'default';
                                    },
                                    onBack: () => { this.wizardStep = 0; },
                                    onNext: () => { this.wizardStep = 1; },
                                    onFinish: () => { this.confirmWizardFinish(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 783, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        step: this.wizardStep,
                                        projectName: this.wizardProjectName,
                                        projectDir: this.userProjectDir,
                                        modulesHint: this.wizardModulesHint,
                                        willCreateFile: this.wizardWillCreateFile,
                                        onNameChange: (v: string) => { this.wizardProjectName = v; },
                                        onCancel: () => {
                                            this.showWizard = false;
                                            this.wizardLaunchTarget = 'default';
                                        },
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
                                    projectDir: this.userProjectDir,
                                    modulesHint: this.wizardModulesHint,
                                    willCreateFile: this.wizardWillCreateFile
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 801, col: 9 });
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 809, col: 9 });
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showGitHubUnlock) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.GitHubUnlockDialog.bind(this)();
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
    GitHubUnlockDialog(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create({ alignContent: Alignment.Center });
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#00000066');
            Column.onClick(() => this.closeGitHubUnlockDialog());
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(460);
            Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
            Column.clip(true);
            Column.onClick(() => { });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(34);
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(ProteusHomeColors.PANEL_HEAD_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('GitHub Star 解锁专业版');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusHomeColors.PANEL_HEAD_TEXT);
            Text.fontWeight(FontWeight.Bold);
            Text.layoutWeight(1);
            Text.padding({ left: 12 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('×');
            Text.fontSize(16);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width(32);
            Text.height(32);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => this.closeGitHubUnlockDialog());
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 14, right: 14, top: 12, bottom: 8 });
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 已记住账户
            if (this.githubHasToken) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.padding(10);
                        Column.margin({ bottom: 8 });
                        Column.backgroundColor(ProteusHomeColors.PANEL_BG);
                        Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('已记住账户');
                        Text.fontSize(9);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.githubBoundLogin.length > 0
                            ? `@${this.githubBoundLogin}`
                            : 'GitHub 已授权');
                        Text.fontSize(16);
                        Text.fontWeight(FontWeight.Bold);
                        Text.fontColor(ProteusHomeColors.LINK);
                        Text.width('100%');
                        Text.margin({ top: 2, bottom: 4 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('下次启动将自动用此账户检测 Star，无需再次登录');
                        Text.fontSize(9);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('首次解锁（仅需一次）');
                        Text.fontSize(10);
                        Text.fontWeight(FontWeight.Bold);
                        Text.fontColor(ProteusHomeColors.TEXT);
                        Text.width('100%');
                        Text.margin({ bottom: 6 });
                    }, Text);
                    Text.pop();
                    this.GitHubUnlockStepRow.bind(this)('1', '点「开始授权」，浏览器登录 GitHub');
                    this.GitHubUnlockStepRow.bind(this)('2', '输入设备码完成授权（账户将被记住）');
                    this.GitHubUnlockStepRow.bind(this)('3', 'Star 仓库后自动成为专业版');
                    this.GitHubUnlockStepRow.bind(this)('4', '之后每次启动联网自动复验，无需再登录');
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 仅在重新授权流程中显示设备码
            if (this.githubShowDeviceCode || (!this.githubHasToken && this.githubUserCode.length > 0)) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.padding(10);
                        Column.margin({ top: 4, bottom: 8 });
                        Column.backgroundColor(ProteusHomeColors.PANEL_BG);
                        Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('设备码');
                        Text.fontSize(9);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
                        Text.margin({ bottom: 4 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.githubUserCode.length > 0 ? this.githubUserCode : '— — — —');
                        Text.fontSize(22);
                        Text.fontWeight(FontWeight.Bold);
                        Text.fontColor(this.githubUserCode.length > 0
                            ? ProteusHomeColors.LINK
                            : ProteusHomeColors.TEXT_DIM);
                        Text.letterSpacing(2);
                        Text.width('100%');
                        Text.textAlign(TextAlign.Center);
                        Text.padding({ top: 8, bottom: 8 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('在 github.com/login/device 输入上述代码');
                        Text.fontSize(8);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
                        Text.textAlign(TextAlign.Center);
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
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6, bottom: 6 });
            Row.backgroundColor(ProteusHomeColors.ACCENT_SOFT);
            Row.border({ width: 1, color: ProteusHomeColors.ACCENT_HOVER });
            Row.margin({ bottom: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Circle.create();
            Circle.width(7);
            Circle.height(7);
            Circle.fill(this.githubUnlockBusy
                ? ProteusHomeColors.ACCENT
                : (this.aboutInfo.isStarPro
                    ? '#2F7D4A'
                    : ProteusHomeColors.TEXT_DIM));
            Circle.margin({ right: 6 });
        }, Circle);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.githubUnlockStatus.length > 0
                ? this.githubUnlockStatus
                : (this.githubHasToken ? '就绪 · 将自动检测' : '就绪 · 首次请授权'));
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.TEXT);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        Row.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 主操作：有账户 → 检测；无账户 → 授权
            Row.create({ space: 8 });
            // 主操作：有账户 → 检测；无账户 → 授权
            Row.width('100%');
            // 主操作：有账户 → 检测；无账户 → 授权
            Row.padding({ left: 14, right: 14, top: 4, bottom: 6 });
            // 主操作：有账户 → 检测；无账户 → 授权
            Row.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.githubHasToken && !this.githubShowDeviceCode) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: this.githubUnlockBusy ? '检测中…' : '检测 Star',
                                    primary: true,
                                    btnEnabled: !this.githubUnlockBusy,
                                    onAction: () => { void this.recheckGitHubStar(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 960, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: this.githubUnlockBusy ? '检测中…' : '检测 Star',
                                        primary: true,
                                        btnEnabled: !this.githubUnlockBusy,
                                        onAction: () => { void this.recheckGitHubStar(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: this.githubUnlockBusy ? '检测中…' : '检测 Star',
                                    primary: true,
                                    btnEnabled: !this.githubUnlockBusy
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: '打开仓库',
                                    primary: false,
                                    btnEnabled: true,
                                    onAction: () => this.openExternalUrl(GitHubOAuthConfig.REPO_URL)
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 966, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '打开仓库',
                                        primary: false,
                                        btnEnabled: true,
                                        onAction: () => this.openExternalUrl(GitHubOAuthConfig.REPO_URL)
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '打开仓库',
                                    primary: false,
                                    btnEnabled: true
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: this.githubUnlockBusy ? '进行中…' : '开始授权',
                                    primary: true,
                                    btnEnabled: !this.githubUnlockBusy,
                                    onAction: () => { void this.startGitHubDeviceFlow(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 973, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: this.githubUnlockBusy ? '进行中…' : '开始授权',
                                        primary: true,
                                        btnEnabled: !this.githubUnlockBusy,
                                        onAction: () => { void this.startGitHubDeviceFlow(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: this.githubUnlockBusy ? '进行中…' : '开始授权',
                                    primary: true,
                                    btnEnabled: !this.githubUnlockBusy
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: '打开验证页',
                                    primary: false,
                                    btnEnabled: this.githubVerifyUri.length > 0 && !this.githubUnlockBusy,
                                    onAction: () => this.openExternalUrl(this.githubVerifyUri)
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 979, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '打开验证页',
                                        primary: false,
                                        btnEnabled: this.githubVerifyUri.length > 0 && !this.githubUnlockBusy,
                                        onAction: () => this.openExternalUrl(this.githubVerifyUri)
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '打开验证页',
                                    primary: false,
                                    btnEnabled: this.githubVerifyUri.length > 0 && !this.githubUnlockBusy
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: '打开仓库',
                                    primary: false,
                                    btnEnabled: true,
                                    onAction: () => this.openExternalUrl(GitHubOAuthConfig.REPO_URL)
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 985, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '打开仓库',
                                        primary: false,
                                        btnEnabled: true,
                                        onAction: () => this.openExternalUrl(GitHubOAuthConfig.REPO_URL)
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '打开仓库',
                                    primary: false,
                                    btnEnabled: true
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                });
            }
        }, If);
        If.pop();
        // 主操作：有账户 → 检测；无账户 → 授权
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 14, right: 14, top: 2, bottom: 12 });
            Row.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.githubHasToken && !this.githubShowDeviceCode) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: '换账号重新授权',
                                    primary: false,
                                    btnEnabled: !this.githubUnlockBusy,
                                    onAction: () => { void this.startGitHubDeviceFlow(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 999, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '换账号重新授权',
                                        primary: false,
                                        btnEnabled: !this.githubUnlockBusy,
                                        onAction: () => { void this.startGitHubDeviceFlow(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '换账号重新授权',
                                    primary: false,
                                    btnEnabled: !this.githubUnlockBusy
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: '清除账户',
                                    primary: false,
                                    btnEnabled: !this.githubUnlockBusy,
                                    onAction: () => { void this.clearRememberedGitHubAccount(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1005, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '清除账户',
                                        primary: false,
                                        btnEnabled: !this.githubUnlockBusy,
                                        onAction: () => { void this.clearRememberedGitHubAccount(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '清除账户',
                                    primary: false,
                                    btnEnabled: !this.githubUnlockBusy
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
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
            Blank.create();
        }, Blank);
        Blank.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeDownloadBtn(this, {
                        label: '关闭',
                        primary: false,
                        btnEnabled: true,
                        onAction: () => this.closeGitHubUnlockDialog()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1013, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '关闭',
                            primary: false,
                            btnEnabled: true,
                            onAction: () => this.closeGitHubUnlockDialog()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '关闭',
                        primary: false,
                        btnEnabled: true
                    });
                }
            }, { name: "ProteusHomeDownloadBtn" });
        }
        Row.pop();
        Column.pop();
        Stack.pop();
    }
    GitHubUnlockStepRow(num: string, text: string, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.alignItems(VerticalAlign.Top);
            Row.margin({ bottom: 5 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(num);
            Text.fontSize(9);
            Text.fontWeight(FontWeight.Bold);
            Text.fontColor(ProteusHomeColors.BTN_PRIMARY_TEXT);
            Text.textAlign(TextAlign.Center);
            Text.width(18);
            Text.height(18);
            Text.backgroundColor(ProteusHomeColors.BTN_PRIMARY);
            Text.borderRadius(2);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(text);
            Text.fontSize(10);
            Text.fontColor(ProteusHomeColors.TEXT);
            Text.layoutWeight(1);
            Text.lineHeight(16);
        }, Text);
        Text.pop();
        Row.pop();
    }
    LeftSidebar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('36%');
            Column.height('100%');
            Column.backgroundColor(ProteusHomeColors.SIDEBAR_BG);
            Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
            Column.clip(true);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionTitle(this, { title: 'Getting Started' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1060, col: 7 });
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('双击 · 须先新建工程');
            Text.fontSize(8);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width('100%');
            Text.padding({ left: 10, right: 8, top: 2, bottom: 1 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, {
                        label: 'Simulation',
                        requireDoubleClick: true,
                        onAction: () => this.openSimulation()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1067, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Simulation',
                            requireDoubleClick: true,
                            onAction: () => this.openSimulation()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Simulation',
                        requireDoubleClick: true
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeIconLink(this, {
                        label: 'PCB Layout',
                        requireDoubleClick: true,
                        onAction: () => { this.openPcbLayout(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1072, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'PCB Layout',
                            requireDoubleClick: true,
                            onAction: () => { this.openPcbLayout(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'PCB Layout',
                        requireDoubleClick: true
                    });
                }
            }, { name: "ProteusHomeIconLink" });
        }
        Column.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1082, col: 7 });
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
                    let componentCall = new ProteusHomeSectionTitle(this, { title: 'Start' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1083, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Start'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Start'
                    });
                }
            }, { name: "ProteusHomeSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Start 吃掉剩余高度：工程列表铺满，避免 About 下方大块空白
            Column.create();
            // Start 吃掉剩余高度：工程列表铺满，避免 About 下方大块空白
            Column.width('100%');
            // Start 吃掉剩余高度：工程列表铺满，避免 About 下方大块空白
            Column.layoutWeight(1);
            // Start 吃掉剩余高度：工程列表铺满，避免 About 下方大块空白
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
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
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1090, col: 13 });
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
            Column.margin({ left: 6, right: 6, bottom: 4 });
            Column.alignItems(HorizontalAlign.Start);
            Column.justifyContent(FlexAlign.Start);
            Column.backgroundColor(ProteusHomeColors.PANEL_BG);
            Column.border({ width: 1, color: ProteusHomeColors.LISTBOX_BORDER });
            Column.clip(true);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (!this.ready) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('Loading…');
                        Text.fontSize(10);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.padding({ left: 8, top: 6 });
                        Text.width('100%');
                        Text.textAlign(TextAlign.Start);
                    }, Text);
                    Text.pop();
                });
            }
            else if (this.listEntries().length === 0) {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.padding({ left: 8, right: 8, top: 6, bottom: 6 });
                        Column.alignItems(HorizontalAlign.Start);
                        Column.justifyContent(FlexAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.showSamples ? '(no samples)' : '(no recent projects)');
                        Text.fontSize(10);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
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
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1121, col: 17 });
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
                        Scroll.height('100%');
                        Scroll.scrollBar(BarState.Auto);
                        Scroll.align(Alignment.TopStart);
                    }, Scroll);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.alignItems(HorizontalAlign.Start);
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
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1136, col: 19 });
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
            Row.padding({ left: 8, right: 8, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeDownloadBtn(this, {
                        label: 'Open',
                        primary: true,
                        btnEnabled: this.canOpenSelected(),
                        onAction: () => this.openSelected()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1164, col: 11 });
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
        // Start 吃掉剩余高度：工程列表铺满，避免 About 下方大块空白
        Column.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1178, col: 7 });
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
                    let componentCall = new ProteusHomeSectionTitle(this, { title: 'Help' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1179, col: 7 });
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
                    let componentCall = new ProteusHomeIconLink(this, { label: 'Help Home', onAction: () => this.openHelpHome() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1181, col: 9 });
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
        Column.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeSectionDivider(this, {}, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1187, col: 7 });
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
                    let componentCall = new ProteusHomeSectionTitle(this, { title: 'About' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1188, col: 7 });
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
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`© ${this.aboutInfo.copyrightLine}`);
            Text.fontSize(8);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.margin({ top: 4, bottom: 2 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.aboutInfo.releaseLine);
            Text.fontSize(8);
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
            Text.margin({ top: 2, bottom: 4 });
            Text.padding({ left: 4, right: 4, top: 2, bottom: 2 });
            Text.onClick(() => this.openOfficialWebsite());
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ top: 2, bottom: 2 });
            Column.border({ width: 1, color: ProteusHomeColors.ROW_BORDER });
            Column.margin({ left: 6, right: 6, bottom: 2 });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeAboutRow(this, {
                        label: 'Licence',
                        value: this.aboutInfo.licenseTierLine,
                        warn: this.aboutInfo.isEvaluation
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1212, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Licence',
                            value: this.aboutInfo.licenseTierLine,
                            warn: this.aboutInfo.isEvaluation
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Licence',
                        value: this.aboutInfo.licenseTierLine,
                        warn: this.aboutInfo.isEvaluation
                    });
                }
            }, { name: "ProteusHomeAboutRow" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeAboutRow(this, {
                        label: 'Registered To',
                        value: this.aboutInfo.registeredToLine,
                        warn: this.aboutInfo.isEvaluation
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1217, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1222, col: 11 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1227, col: 11 });
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
            Text.create(this.aboutInfo.isStarPro || !this.aboutInfo.isEvaluation
                ? '专业版已激活'
                : 'GitHub Star 解锁专业版…');
            Text.fontSize(8);
            Text.fontColor(ProteusHomeColors.LINK);
            Text.decoration({ type: TextDecorationType.Underline, color: ProteusHomeColors.LINK });
            Text.width('100%');
            Text.textAlign(TextAlign.Center);
            Text.padding({ top: 2, bottom: 2 });
            Text.onClick(() => this.openGitHubUnlockDialog());
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`Free Memory: ${this.aboutInfo.freeMemoryLine}`);
            Text.fontSize(8);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width('100%');
            Text.padding({ left: 8, top: 2, bottom: 4 });
        }, Text);
        Text.pop();
        Column.pop();
        Column.pop();
    }
    StartToolbar(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Flex.create({ wrap: FlexWrap.Wrap });
            Flex.width('100%');
            Flex.padding({ left: 8, top: 4, bottom: 2, right: 4 });
        }, Flex);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeInlineLink(this, { label: 'Open Project', onAction: () => { void this.handleOpenProject(); } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1268, col: 7 });
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
                    let componentCall = new ProteusHomeInlineLink(this, { label: 'New Project', onAction: () => this.startNewProjectWizard() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1272, col: 7 });
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
                    let componentCall = new ProteusHomeInlineLink(this, { label: 'Open Sample', onAction: () => this.openSampleList() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1276, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Open Sample',
                            onAction: () => this.openSampleList()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Open Sample'
                    });
                }
            }, { name: "ProteusHomeInlineLink" });
        }
        Flex.pop();
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
                    let componentCall = new ProteusHomeAnnouncementPanel(this, {
                        title: this.announcement.title,
                        body: this.announcement.body,
                        imageUrl: this.announcement.imageUrl,
                        publishedAt: this.announcement.publishedAt,
                        loading: this.announcementLoading,
                        panelWeight: 2.6
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1285, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: this.announcement.title,
                            body: this.announcement.body,
                            imageUrl: this.announcement.imageUrl,
                            publishedAt: this.announcement.publishedAt,
                            loading: this.announcementLoading,
                            panelWeight: 2.6
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: this.announcement.title,
                        body: this.announcement.body,
                        imageUrl: this.announcement.imageUrl,
                        publishedAt: this.announcement.publishedAt,
                        loading: this.announcementLoading,
                        panelWeight: 2.6
                    });
                }
            }, { name: "ProteusHomeAnnouncementPanel" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomePanel(this, {
                        title: 'News', panelWeight: 1, highlighted: this.newsHighlight,
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
                                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1326, col: 17 });
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
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1294, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'News',
                            panelWeight: 1,
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
                                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/pages/HomePage.ets", line: 1326, col: 17 });
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
                        title: 'News', panelWeight: 1, highlighted: this.newsHighlight
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
