/**
 * ElecDraw 启动页 — 工业灰阶布局
 * 顶栏 | 左栏(Getting Started / Start / Help / About) | 右栏(Announcement / News)
 */
import { BusinessError } from '@kit.BasicServicesKit';
import { Want, common } from '@kit.AbilityKit';
import { picker, fileUri } from '@kit.CoreFileKit';
import fs from '@ohos.file.fs';
import { APP_VERSION_CODE, APP_VERSION_NAME, appVersionLabel, Logger,
  GitHubDeviceAuth, GitHubOAuthConfig, GitHubStarVerifier, StarCheckKind,
  LicenseManager, FeatureGate, EventBus, ModuleEvent
} from 'common';
import { AppService } from '../services/AppService';
import { HomeAnnouncement, HomeAnnouncementService } from '../services/HomeAnnouncementService';
import { PROTEUS_THEME_REV_KEY } from '../theme/ThemeManager';
import {
  ProteusHomeColors, ProteusHomeDownloadBtn, ProteusHomeIconLink, ProteusHomeInlineLink,
  ProteusHomeNewsItem, ProteusHomePanel, ProteusHomeRecentRow,
  ProteusHomeTopBar, ProteusHomeWizardDialog, ProteusHomeBottomStrip, ProteusHomeTextDialog,
  ProteusHomeBackdrop, ProteusHomeAboutRow, ProteusHomeHelpDialog,
  ProteusHomeSectionTitle, ProteusHomeSectionDivider, ProteusHomeNewsRow,
  ProteusHomeAnnouncementPanel
} from '../components/proteus/ProteusHomeWidgets';
import { maximizeAppWindow } from '../utils/WindowLaunchUtil';
import { ProjectPaths } from '../utils/ProjectPaths';
import {
  collectHomeAboutInfo, defaultHomeAboutSnapshot, HomeAboutSnapshot, HOME_OFFICIAL_WEBSITE_URL
} from '../utils/HomeAboutInfo';
import { ProteusFonts } from '../theme/ProteusTheme';

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

const MIGRATION_GUIDE_TEXT: string =
  '从 Proteus / 其他 EDA 迁移到 AI-SCH Design Suite\n\n' +
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

const HELP_HOME_TEXT: string =
  'AI-SCH Design Suite 操作手册\n' +
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

const UPDATES_INFO_TEXT: string =
  '版本更新通过应用分发渠道发布。\n\n' +
  '当前运行版本已在 News 列表中标记为 In Use。如需教程工程，请使用 Start → Open Sample。';

interface HomeProjectEntry {
  path: string;
  name: string;
  modifiedMs: number;
  isRecovery: boolean;
}

@Entry
@Component
struct HomePage {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @State recentEntries: HomeProjectEntry[] = [];
  @State sampleEntries: HomeProjectEntry[] = [];
  @State recoveryFiles: string[] = [];
  @State userProjectDir: string = '';
  @State selectedPath: string = '';
  @State ready: boolean = false;
  @State showWizard: boolean = false;
  @State wizardStep: number = 0;
  @State wizardProjectName: string = '';
  @State showSamples: boolean = false;
  @State ignoreBeta: boolean = false;
  @State newsItems: ProteusHomeNewsItem[] = [];
  @State aboutInfo: HomeAboutSnapshot = defaultHomeAboutSnapshot();
  @State newsHighlight: boolean = false;
  @State showMigrationGuide: boolean = false;
  @State showHelpDialog: boolean = false;
  @State helpDialogTitle: string = '';
  @State helpDialogBody: string = '';
  @State helpDialogPrimaryLabel: string = '';
  @State showGitHubUnlock: boolean = false;
  @State githubUserCode: string = '';
  @State githubUnlockStatus: string = '';
  @State githubUnlockBusy: boolean = false;
  /** 已记住 GitHub 账户（本地有 token） */
  @State githubHasToken: boolean = false;
  @State githubBoundLogin: string = '';
  /** true=正在走 Device Flow（显示设备码区） */
  @State githubShowDeviceCode: boolean = false;
  @State announcement: HomeAnnouncement = HomeAnnouncementService.defaultAnnouncement();
  @State announcementLoading: boolean = false;
  @State wizardModulesHint: string = 'Schematic · Simulation';
  @State wizardWillCreateFile: boolean = false;
  private helpDialogPrimaryAction: (() => void) | null = null;
  private githubDeviceCode: string = '';
  private githubVerifyUri: string = GitHubOAuthConfig.VERIFICATION_URI_FALLBACK;

  private appService: AppService = AppService.getInstance();
  private newsHighlightTimer: number = -1;
  private launchGuard: boolean = false;
  /** New Project 向导完成后的目标：default | pcb | simulation */
  private wizardLaunchTarget: string = 'default';

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
    } finally {
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
    } catch (e) {
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
    } catch (e) {
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
      } else {
        this.githubUnlockStatus = star.message;
      }
    } catch (e) {
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
      } else if (!this.githubHasToken) {
        this.githubUnlockStatus = '授权已失效，请重新授权一次';
      }
    } catch (e) {
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
    } catch (e) {
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
      if (!seen.has(p)) { seen.add(p); merged.push(p); }
    };
    const recents = this.appService.filePersistence.getRecentFiles();
    for (let i = 0; i < recents.length; i++) { push(recents[i]); }
    const sandbox = this.appService.listUserProjectFiles();
    for (let i = 0; i < sandbox.length; i++) { push(sandbox[i]); }
    for (let i = 0; i < this.recoveryFiles.length; i++) { push(this.recoveryFiles[i]); }
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
    } catch (_e) {
      return false;
    }
  }

  private entryFromPath(path: string, isRecovery: boolean): HomeProjectEntry {
    let modifiedMs = 0;
    try {
      let ms = fs.statSync(path).mtime;
      if (ms > 0 && ms < 1_000_000_000_000) { ms = ms * 1000; }
      modifiedMs = ms;
    } catch (_e) { /* ignore */ }
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
    } catch (_e) {
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
      if (uri.length > 0) { opt.defaultFilePathUri = uri; }
      const uris = await new picker.DocumentViewPicker(this.getHostCtx()).select(opt);
      if (uris && uris.length > 0) { this.openProjectPath(uris[0]); }
    } catch (_e) { /* ignore */ }
  }

  startNewProjectWizard(target: string = 'default'): void {
    this.wizardLaunchTarget = target;
    this.wizardProjectName = '';
    this.wizardStep = 0;
    if (target === 'pcb') {
      this.wizardModulesHint = 'PCB Layout';
      this.wizardWillCreateFile = true;
    } else if (target === 'simulation') {
      this.wizardModulesHint = 'Schematic · Simulation';
      this.wizardWillCreateFile = true;
    } else {
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
    } catch (_e) {
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
    this.openHelpDialog(
      'Help Home — 操作手册',
      HELP_HOME_TEXT,
      '打开教学面板',
      () => {
        const scratchOpts: HomeScratchOptions = { openRightTab: 6, expandRightPanel: true };
        this.launchScratchWorkspace(scratchOpts);
      }
    );
  }

  openFlowchartUnavailable(): void {
    this.openHelpDialog(
      'New Flowchart',
      'Flowchart 模块尚未在本版本中提供。\n\n请使用 Simulation 或打开示例工程绘制原理图。'
    );
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

  build() {
    Stack() {
      ProteusHomeBackdrop() {
        Column() {
          ProteusHomeTopBar({
            titleLine: 'Schematic & Simulation Suite',
            versionLabel: `Version ${APP_VERSION_NAME}`
          })

          Row() {
            this.LeftSidebar()
            Column()
              .width(1)
              .height('100%')
              .backgroundColor(ProteusHomeColors.PANEL_BORDER)
            this.RightWorkspace()
          }
          .layoutWeight(1)
          .width('100%')
          .padding(8)
          .backgroundColor(ProteusHomeColors.WORKSPACE)

          ProteusHomeBottomStrip({ statusLine: this.aboutInfo.platformLine })
        }
        .width('100%')
        .height('100%')
        .key(`home89_${this.themeRev}`)
      }

      if (this.showWizard) {
        ProteusHomeWizardDialog({
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
        })
      }

      if (this.showMigrationGuide) {
        ProteusHomeTextDialog({
          title: 'Migration Guide',
          body: MIGRATION_GUIDE_TEXT,
          onClose: () => { this.showMigrationGuide = false; }
        })
      }

      if (this.showHelpDialog) {
        ProteusHomeHelpDialog({
          title: this.helpDialogTitle,
          body: this.helpDialogBody,
          primaryLabel: this.helpDialogPrimaryLabel,
          onPrimary: () => { this.runHelpDialogPrimary(); },
          onClose: () => { this.closeHelpDialog(); }
        })
      }

      if (this.showGitHubUnlock) {
        this.GitHubUnlockDialog()
      }
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  GitHubUnlockDialog() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000066')
        .onClick(() => this.closeGitHubUnlockDialog())

      Column() {
        Row() {
          Text('GitHub Star 解锁专业版')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusHomeColors.PANEL_HEAD_TEXT)
            .fontWeight(FontWeight.Bold)
            .layoutWeight(1)
            .padding({ left: 12 })
          Text('×')
            .fontSize(16)
            .fontColor(ProteusHomeColors.TEXT_DIM)
            .width(32)
            .height(32)
            .textAlign(TextAlign.Center)
            .onClick(() => this.closeGitHubUnlockDialog())
        }
        .width('100%')
        .height(34)
        .alignItems(VerticalAlign.Center)
        .backgroundColor(ProteusHomeColors.PANEL_HEAD_BG)
        .border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER })

        Column() {
          // 已记住账户
          if (this.githubHasToken) {
            Column() {
              Text('已记住账户')
                .fontSize(9)
                .fontColor(ProteusHomeColors.TEXT_DIM)
                .width('100%')
              Text(this.githubBoundLogin.length > 0
                ? `@${this.githubBoundLogin}`
                : 'GitHub 已授权')
                .fontSize(16)
                .fontWeight(FontWeight.Bold)
                .fontColor(ProteusHomeColors.LINK)
                .width('100%')
                .margin({ top: 2, bottom: 4 })
              Text('下次启动将自动用此账户检测 Star，无需再次登录')
                .fontSize(9)
                .fontColor(ProteusHomeColors.TEXT_DIM)
                .width('100%')
            }
            .width('100%')
            .padding(10)
            .margin({ bottom: 8 })
            .backgroundColor(ProteusHomeColors.PANEL_BG)
            .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
            .alignItems(HorizontalAlign.Start)
          } else {
            Text('首次解锁（仅需一次）')
              .fontSize(10)
              .fontWeight(FontWeight.Bold)
              .fontColor(ProteusHomeColors.TEXT)
              .width('100%')
              .margin({ bottom: 6 })
            this.GitHubUnlockStepRow('1', '点「开始授权」，浏览器登录 GitHub')
            this.GitHubUnlockStepRow('2', '输入设备码完成授权（账户将被记住）')
            this.GitHubUnlockStepRow('3', 'Star 仓库后自动成为专业版')
            this.GitHubUnlockStepRow('4', '之后每次启动联网自动复验，无需再登录')
          }

          // 仅在重新授权流程中显示设备码
          if (this.githubShowDeviceCode || (!this.githubHasToken && this.githubUserCode.length > 0)) {
            Column() {
              Text('设备码')
                .fontSize(9)
                .fontColor(ProteusHomeColors.TEXT_DIM)
                .width('100%')
                .margin({ bottom: 4 })
              Text(this.githubUserCode.length > 0 ? this.githubUserCode : '— — — —')
                .fontSize(22)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.githubUserCode.length > 0
                  ? ProteusHomeColors.LINK
                  : ProteusHomeColors.TEXT_DIM)
                .letterSpacing(2)
                .width('100%')
                .textAlign(TextAlign.Center)
                .padding({ top: 8, bottom: 8 })
              Text('在 github.com/login/device 输入上述代码')
                .fontSize(8)
                .fontColor(ProteusHomeColors.TEXT_DIM)
                .width('100%')
                .textAlign(TextAlign.Center)
            }
            .width('100%')
            .padding(10)
            .margin({ top: 4, bottom: 8 })
            .backgroundColor(ProteusHomeColors.PANEL_BG)
            .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
          }

          Row() {
            Circle()
              .width(7)
              .height(7)
              .fill(this.githubUnlockBusy
                ? ProteusHomeColors.ACCENT
                : (this.aboutInfo.isStarPro
                  ? '#2F7D4A'
                  : ProteusHomeColors.TEXT_DIM))
              .margin({ right: 6 })
            Text(this.githubUnlockStatus.length > 0
              ? this.githubUnlockStatus
              : (this.githubHasToken ? '就绪 · 将自动检测' : '就绪 · 首次请授权'))
              .fontSize(9)
              .fontColor(ProteusHomeColors.TEXT)
              .layoutWeight(1)
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 6, bottom: 6 })
          .backgroundColor(ProteusHomeColors.ACCENT_SOFT)
          .border({ width: 1, color: ProteusHomeColors.ACCENT_HOVER })
          .margin({ bottom: 4 })
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 12, bottom: 8 })
        .backgroundColor(ProteusHomeColors.PANEL_INSET)
        .alignItems(HorizontalAlign.Start)

        // 主操作：有账户 → 检测；无账户 → 授权
        Row({ space: 8 }) {
          if (this.githubHasToken && !this.githubShowDeviceCode) {
            ProteusHomeDownloadBtn({
              label: this.githubUnlockBusy ? '检测中…' : '检测 Star',
              primary: true,
              btnEnabled: !this.githubUnlockBusy,
              onAction: () => { void this.recheckGitHubStar(); }
            })
            ProteusHomeDownloadBtn({
              label: '打开仓库',
              primary: false,
              btnEnabled: true,
              onAction: () => this.openExternalUrl(GitHubOAuthConfig.REPO_URL)
            })
          } else {
            ProteusHomeDownloadBtn({
              label: this.githubUnlockBusy ? '进行中…' : '开始授权',
              primary: true,
              btnEnabled: !this.githubUnlockBusy,
              onAction: () => { void this.startGitHubDeviceFlow(); }
            })
            ProteusHomeDownloadBtn({
              label: '打开验证页',
              primary: false,
              btnEnabled: this.githubVerifyUri.length > 0 && !this.githubUnlockBusy,
              onAction: () => this.openExternalUrl(this.githubVerifyUri)
            })
            ProteusHomeDownloadBtn({
              label: '打开仓库',
              primary: false,
              btnEnabled: true,
              onAction: () => this.openExternalUrl(GitHubOAuthConfig.REPO_URL)
            })
          }
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 4, bottom: 6 })
        .backgroundColor(ProteusHomeColors.PANEL_INSET)

        Row({ space: 8 }) {
          if (this.githubHasToken && !this.githubShowDeviceCode) {
            ProteusHomeDownloadBtn({
              label: '换账号重新授权',
              primary: false,
              btnEnabled: !this.githubUnlockBusy,
              onAction: () => { void this.startGitHubDeviceFlow(); }
            })
            ProteusHomeDownloadBtn({
              label: '清除账户',
              primary: false,
              btnEnabled: !this.githubUnlockBusy,
              onAction: () => { void this.clearRememberedGitHubAccount(); }
            })
          }
          Blank()
          ProteusHomeDownloadBtn({
            label: '关闭',
            primary: false,
            btnEnabled: true,
            onAction: () => this.closeGitHubUnlockDialog()
          })
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 2, bottom: 12 })
        .backgroundColor(ProteusHomeColors.PANEL_INSET)
      }
      .width(460)
      .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
      .clip(true)
      .onClick(() => { /* 阻止点穿关闭 */ })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  GitHubUnlockStepRow(num: string, text: string) {
    Row() {
      Text(num)
        .fontSize(9)
        .fontWeight(FontWeight.Bold)
        .fontColor(ProteusHomeColors.BTN_PRIMARY_TEXT)
        .textAlign(TextAlign.Center)
        .width(18)
        .height(18)
        .backgroundColor(ProteusHomeColors.BTN_PRIMARY)
        .borderRadius(2)
        .margin({ right: 8 })
      Text(text)
        .fontSize(10)
        .fontColor(ProteusHomeColors.TEXT)
        .layoutWeight(1)
        .lineHeight(16)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
    .margin({ bottom: 5 })
  }

  @Builder
  LeftSidebar() {
    Column() {
      ProteusHomeSectionTitle({ title: 'Getting Started' })
      Column() {
        Text('双击 · 须先新建工程')
          .fontSize(8)
          .fontColor(ProteusHomeColors.TEXT_DIM)
          .width('100%')
          .padding({ left: 10, right: 8, top: 2, bottom: 1 })
        ProteusHomeIconLink({
          label: 'Simulation',
          requireDoubleClick: true,
          onAction: () => this.openSimulation()
        })
        ProteusHomeIconLink({
          label: 'PCB Layout',
          requireDoubleClick: true,
          onAction: () => { this.openPcbLayout(); }
        })
      }
      .width('100%')
      .padding({ top: 2, bottom: 4 })
      .backgroundColor(ProteusHomeColors.PANEL_INSET)

      ProteusHomeSectionDivider()
      ProteusHomeSectionTitle({ title: 'Start' })
      // Start 吃掉剩余高度：工程列表铺满，避免 About 下方大块空白
      Column() {
        this.StartToolbar()

        if (this.showSamples) {
          Row() {
            ProteusHomeInlineLink({
              label: 'Back to Recent Projects',
              onAction: () => this.backToRecentList()
            })
          }
          .width('100%')
          .padding({ left: 8, bottom: 2 })
        }

        Text(this.showSamples ? 'Sample Projects' : 'Recent Projects')
          .fontSize(10)
          .fontColor(ProteusHomeColors.TEXT)
          .fontWeight(FontWeight.Bold)
          .width('100%')
          .padding({ left: 8, bottom: 2 })

        Column() {
          if (!this.ready) {
            Text('Loading…')
              .fontSize(10)
              .fontColor(ProteusHomeColors.TEXT_DIM)
              .padding({ left: 8, top: 6 })
              .width('100%')
              .textAlign(TextAlign.Start)
          } else if (this.listEntries().length === 0) {
            Column() {
              Text(this.showSamples ? '(no samples)' : '(no recent projects)')
                .fontSize(10)
                .fontColor(ProteusHomeColors.TEXT_DIM)
                .width('100%')
              if (!this.showSamples) {
                ProteusHomeInlineLink({
                  label: 'New Project…',
                  onAction: () => this.startNewProjectWizard()
                })
                  .margin({ top: 4 })
              }
            }
            .width('100%')
            .padding({ left: 8, right: 8, top: 6, bottom: 6 })
            .alignItems(HorizontalAlign.Start)
            .justifyContent(FlexAlign.Start)
          } else {
            Scroll() {
              Column() {
                ForEach(this.listEntries(), (e: HomeProjectEntry) => {
                  ProteusHomeRecentRow({
                    name: e.name,
                    selected: this.selectedPath === e.path,
                    warn: e.isRecovery,
                    onSelect: () => { this.selectedPath = e.path; },
                    onOpen: () => { this.openProjectPath(e.path, e.isRecovery); }
                  })
                }, (e: HomeProjectEntry) => `${this.showSamples}_${e.path}`)
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)
            }
            .width('100%')
            .height('100%')
            .scrollBar(BarState.Auto)
            .align(Alignment.TopStart)
          }
        }
        .width('100%')
        .layoutWeight(1)
        .margin({ left: 6, right: 6, bottom: 4 })
        .alignItems(HorizontalAlign.Start)
        .justifyContent(FlexAlign.Start)
        .backgroundColor(ProteusHomeColors.PANEL_BG)
        .border({ width: 1, color: ProteusHomeColors.LISTBOX_BORDER })
        .clip(true)

        Row() {
          ProteusHomeDownloadBtn({
            label: 'Open',
            primary: true,
            btnEnabled: this.canOpenSelected(),
            onAction: () => this.openSelected()
          })
        }
        .width('100%')
        .padding({ left: 8, right: 8, bottom: 4 })
      }
      .width('100%')
      .layoutWeight(1)
      .backgroundColor(ProteusHomeColors.PANEL_INSET)

      ProteusHomeSectionDivider()
      ProteusHomeSectionTitle({ title: 'Help' })
      Column() {
        ProteusHomeIconLink({ label: 'Help Home', onAction: () => this.openHelpHome() })
      }
      .width('100%')
      .padding({ top: 2, bottom: 4 })
      .backgroundColor(ProteusHomeColors.PANEL_INSET)

      ProteusHomeSectionDivider()
      ProteusHomeSectionTitle({ title: 'About' })
      Column() {
        Text(`© ${this.aboutInfo.copyrightLine}`)
          .fontSize(8)
          .fontColor(ProteusHomeColors.TEXT_DIM)
          .width('100%')
          .textAlign(TextAlign.Center)
          .margin({ top: 4, bottom: 2 })
        Text(this.aboutInfo.releaseLine)
          .fontSize(8)
          .fontColor(ProteusHomeColors.TEXT)
          .width('100%')
          .textAlign(TextAlign.Center)
        Text(this.aboutInfo.websiteLine)
          .fontSize(8)
          .fontColor(ProteusHomeColors.LINK)
          .decoration({ type: TextDecorationType.Underline, color: ProteusHomeColors.LINK })
          .width('100%')
          .textAlign(TextAlign.Center)
          .margin({ top: 2, bottom: 4 })
          .padding({ left: 4, right: 4, top: 2, bottom: 2 })
          .onClick(() => this.openOfficialWebsite())

        Column() {
          ProteusHomeAboutRow({
            label: 'Licence',
            value: this.aboutInfo.licenseTierLine,
            warn: this.aboutInfo.isEvaluation
          })
          ProteusHomeAboutRow({
            label: 'Registered To',
            value: this.aboutInfo.registeredToLine,
            warn: this.aboutInfo.isEvaluation
          })
          ProteusHomeAboutRow({
            label: 'Customer No.',
            value: this.aboutInfo.customerNumberLine,
            warn: this.aboutInfo.isEvaluation
          })
          ProteusHomeAboutRow({
            label: 'Licence Expires',
            value: this.aboutInfo.licenseExpiresLine,
            warn: this.aboutInfo.isEvaluation
          })
        }
        .width('100%')
        .padding({ top: 2, bottom: 2 })
        .border({ width: 1, color: ProteusHomeColors.ROW_BORDER })
        .margin({ left: 6, right: 6, bottom: 2 })

        Text(this.aboutInfo.isStarPro || !this.aboutInfo.isEvaluation
          ? '专业版已激活'
          : 'GitHub Star 解锁专业版…')
          .fontSize(8)
          .fontColor(ProteusHomeColors.LINK)
          .decoration({ type: TextDecorationType.Underline, color: ProteusHomeColors.LINK })
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 2, bottom: 2 })
          .onClick(() => this.openGitHubUnlockDialog())

        Text(`Free Memory: ${this.aboutInfo.freeMemoryLine}`)
          .fontSize(8)
          .fontColor(ProteusHomeColors.TEXT_DIM)
          .width('100%')
          .padding({ left: 8, top: 2, bottom: 4 })
      }
      .width('100%')
      .backgroundColor(ProteusHomeColors.PANEL_INSET)
    }
    .width('36%')
    .height('100%')
    .backgroundColor(ProteusHomeColors.SIDEBAR_BG)
    .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
    .clip(true)
  }

  @Builder
  StartToolbar() {
    Flex({ wrap: FlexWrap.Wrap }) {
      ProteusHomeInlineLink({ label: 'Open Project', onAction: () => { void this.handleOpenProject(); } })
      Text(' | ')
        .fontSize(10)
        .fontColor(ProteusHomeColors.TEXT_DIM)
      ProteusHomeInlineLink({ label: 'New Project', onAction: () => this.startNewProjectWizard() })
      Text(' | ')
        .fontSize(10)
        .fontColor(ProteusHomeColors.TEXT_DIM)
      ProteusHomeInlineLink({ label: 'Open Sample', onAction: () => this.openSampleList() })
    }
    .width('100%')
    .padding({ left: 8, top: 4, bottom: 2, right: 4 })
  }

  @Builder
  RightWorkspace() {
    Column({ space: 6 }) {
      ProteusHomeAnnouncementPanel({
        title: this.announcement.title,
        body: this.announcement.body,
        imageUrl: this.announcement.imageUrl,
        publishedAt: this.announcement.publishedAt,
        loading: this.announcementLoading,
        panelWeight: 2.6
      })

      ProteusHomePanel({ title: 'News', panelWeight: 1, highlighted: this.newsHighlight }) {
        Column() {
          Row() {
            Text('Description')
              .fontSize(9)
              .fontColor(ProteusHomeColors.TEXT)
              .fontWeight(FontWeight.Bold)
              .layoutWeight(1)
              .padding({ left: 4 })
            Text('Date')
              .fontSize(9)
              .fontColor(ProteusHomeColors.TEXT)
              .fontWeight(FontWeight.Bold)
              .width(68)
              .textAlign(TextAlign.Center)
            Text('Valid')
              .fontSize(9)
              .fontColor(ProteusHomeColors.TEXT)
              .fontWeight(FontWeight.Bold)
              .width(36)
              .textAlign(TextAlign.Center)
            Blank().width(68)
          }
          .width('100%')
          .height(20)
          .alignItems(VerticalAlign.Center)
          .backgroundColor(ProteusHomeColors.TABLE_HEAD_BG)
          .border({ width: { bottom: 1 }, color: ProteusHomeColors.ROW_BORDER })

          Scroll() {
            Column() {
              ForEach(this.newsItems, (item: ProteusHomeNewsItem) => {
                ProteusHomeNewsRow({
                  description: item.description,
                  releaseDate: item.releaseDate,
                  uscValid: item.uscValid,
                  actionLabel: item.actionLabel,
                  isCurrent: item.actionLabel === 'In Use',
                  showButton: item.actionLabel !== 'In Use',
                  onAction: () => { this.handleNewsAction(item); }
                })
              }, (item: ProteusHomeNewsItem, idx: number) => `n_${idx}`)
            }
            .width('100%')
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Auto)

          Row() {
            Toggle({ type: ToggleType.Checkbox, isOn: this.ignoreBeta })
              .width(13)
              .height(13)
              .margin({ right: 4 })
              .onChange((on: boolean) => { this.ignoreBeta = on; })
            Text('Ignore beta version updates')
              .fontSize(9)
              .fontColor(ProteusHomeColors.TEXT_DIM)
          }
          .width('100%')
          .padding({ left: 8, top: 4, bottom: 6 })
          .alignItems(VerticalAlign.Center)
        }
        .width('100%')
        .height('100%')
        .alignItems(HorizontalAlign.Start)
      }
    }
    .layoutWeight(1)
    .height('100%')
    .margin({ left: 6 })
  }
}
