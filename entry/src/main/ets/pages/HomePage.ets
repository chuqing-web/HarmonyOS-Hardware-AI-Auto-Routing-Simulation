/**
 * ElecDraw 启动页 — 工业灰阶布局
 * 顶栏 | 左栏(Getting Started / Help / About) | 右栏(Start / News)
 */
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { picker, fileUri } from '@kit.CoreFileKit';
import fs from '@ohos.file.fs';
import { APP_VERSION_CODE, APP_VERSION_NAME, appVersionLabel, Logger } from 'common';
import { AppService } from '../services/AppService';
import { PROTEUS_THEME_REV_KEY } from '../theme/ThemeManager';
import {
  ProteusHomeColors, ProteusHomeDownloadBtn, ProteusHomeIconLink, ProteusHomeInlineLink,
  ProteusHomeNewsItem, ProteusHomePanel, ProteusHomeRecentRow,
  ProteusHomeTopBar, ProteusHomeWizardDialog, ProteusHomeBottomStrip, ProteusHomeTextDialog,
  ProteusHomeBackdrop, ProteusHomeAboutRow, ProteusHomeHelpDialog,
  ProteusHomeSectionTitle, ProteusHomeSectionDivider, ProteusHomeNewsRow
} from '../components/proteus/ProteusHomeWidgets';
import { maximizeAppWindow } from '../utils/WindowLaunchUtil';
import { ProjectPaths } from '../utils/ProjectPaths';
import { collectHomeAboutInfo, defaultHomeAboutSnapshot, HomeAboutSnapshot } from '../utils/HomeAboutInfo';

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
  'Help Home — 教学与实验\n\n' +
  '· 进入编辑器后，右侧「教学」面板提供实验模板、步骤说明与 MCU 实验入口\n' +
  '· 也可从 Start → Open Sample 打开 lab_* / Test_Template 教程工程\n' +
  '· 快捷键 F5 运行仿真，F7 执行 ERC\n\n' +
  '提示：点击下方「打开教学面板」将进入未保存工作区，不会自动创建工程文件。';

const HELP_SCHEMATIC_TEXT: string =
  'Schematic Capture — 原理图绘制\n\n' +
  '· W：连线模式  · P：放置器件  · 拖放左侧库中元件到画布\n' +
  '· Ctrl+S 保存工程  · Ctrl+N 通过系统对话框另存为新工程\n' +
  '· 仿真前建议 F7 ERC 检查连接\n\n' +
  '从 Getting Started → Schematic Capture 可进入空白画布（不自动写盘）。';

const HELP_SIMULATION_TEXT: string =
  'Simulation — 电路仿真\n\n' +
  '· F5 或工具栏运行仿真，右侧「仿真 / 仪器」查看波形与探针\n' +
  '· 需先放置电源、地及完整网表；空工程运行仿真不会生成工程文件\n\n' +
  '从 Getting Started → Simulation 可打开仿真侧栏；保存请使用 文件 → 保存。';

const HELP_PCB_TEXT: string =
  'PCB Layout — KiCad 式 PCB 布局\n\n' +
  '· 从原理图「更新 PCB」导入封装与网络\n' +
  '· 选择/移动/旋转封装，走线、过孔工具\n' +
  '· 左侧图层开关，右侧 DRC 检查\n' +
  '· 与原理图共用 .schsim 工程文件';

const HELP_VISUAL_DESIGNER_TEXT: string =
  'Visual Designer 尚未在本版本中提供。\n\n' +
  '请使用 Schematic Capture 与 Simulation 完成设计与验证。';

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
  private helpDialogPrimaryAction: (() => void) | null = null;

  private appService: AppService = AppService.getInstance();
  private newsHighlightTimer: number = -1;
  private launchGuard: boolean = false;

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

  private baseName(path: string): string {
    const norm = path.replace(/\\/g, '/');
    const slash = norm.lastIndexOf('/');
    let name = slash >= 0 ? norm.substring(slash + 1) : norm;
    if (name.endsWith('.schsim')) { name = name.substring(0, name.length - 7); }
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
      if (uri.length > 0) { opt.defaultFilePathUri = uri; }
      const uris = await new picker.DocumentViewPicker(this.getHostCtx()).select(opt);
      if (uris && uris.length > 0) { this.openProjectPath(uris[0]); }
    } catch (_e) { /* ignore */ }
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
    } catch (_e) {
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
    this.openHelpDialog(
      'Help Home',
      HELP_HOME_TEXT,
      '打开教学面板',
      () => {
        const scratchOpts: HomeScratchOptions = { openRightTab: 6, expandRightPanel: true };
        this.launchScratchWorkspace(scratchOpts);
      }
    );
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
    this.openHelpDialog(
      'New Flowchart',
      'Flowchart 模块尚未在本版本中提供。\n\n请使用 Schematic Capture 绘制原理图。'
    );
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
          onNameChange: (v: string) => { this.wizardProjectName = v; },
          onCancel: () => { this.showWizard = false; },
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
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }

  @Builder
  LeftSidebar() {
    Column() {
      ProteusHomeSectionTitle({ title: 'Getting Started' })
      Column() {
        ProteusHomeIconLink({ label: 'Schematic Capture', onAction: () => this.openBlankSchematic() })
        ProteusHomeIconLink({ label: 'PCB Layout', onAction: () => { this.openPcbLayout(); } })
        ProteusHomeIconLink({ label: 'Simulation', onAction: () => this.openSimulation() })
        ProteusHomeIconLink({ label: 'Migration Guide', onAction: () => this.openMigrationGuide() })
        ProteusHomeIconLink({ label: 'What\'s New', onAction: () => this.focusWhatsNew() })
      }
      .width('100%')
      .padding({ top: 2, bottom: 4 })
      .backgroundColor(ProteusHomeColors.PANEL_INSET)

      ProteusHomeSectionDivider()
      ProteusHomeSectionTitle({ title: 'Help' })
      Column() {
        ProteusHomeIconLink({ label: 'Help Home', onAction: () => this.openHelpHome() })
        ProteusHomeIconLink({ label: 'Schematic Capture', onAction: () => this.openHelpTopicSchematic() })
        ProteusHomeIconLink({ label: 'PCB Layout', onAction: () => { this.openPcbLayout(); } })
        ProteusHomeIconLink({ label: 'Simulation', onAction: () => this.openHelpTopicSimulation() })
        ProteusHomeIconLink({ label: 'Visual Designer', tabEnabled: false, onAction: () => { this.openHelpTopicVisualDesigner(); } })
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
          .margin({ top: 6, bottom: 4 })
        Text(this.aboutInfo.releaseLine)
          .fontSize(9)
          .fontColor(ProteusHomeColors.TEXT)
          .width('100%')
          .textAlign(TextAlign.Center)
        Text(this.aboutInfo.websiteLine)
          .fontSize(8)
          .fontColor(ProteusHomeColors.LINK)
          .decoration({ type: TextDecorationType.Underline, color: ProteusHomeColors.LINK })
          .width('100%')
          .textAlign(TextAlign.Center)
          .margin({ top: 2, bottom: 8 })

        Column() {
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
        .padding({ top: 2, bottom: 4 })
        .border({ width: 1, color: ProteusHomeColors.ROW_BORDER })
        .margin({ left: 6, right: 6 })

        Blank()
        Text(`Free Memory: ${this.aboutInfo.freeMemoryLine}`)
          .fontSize(8)
          .fontColor(ProteusHomeColors.TEXT_DIM)
          .width('100%')
          .padding({ left: 8, bottom: 6 })
      }
      .width('100%')
      .layoutWeight(1)
      .backgroundColor(ProteusHomeColors.PANEL_INSET)
    }
    .width('21%')
    .height('100%')
    .backgroundColor(ProteusHomeColors.SIDEBAR_BG)
    .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
    .clip(true)
  }

  @Builder
  StartToolbar() {
    Row() {
      ProteusHomeInlineLink({ label: 'Open Project', onAction: () => { void this.handleOpenProject(); } })
      Text(' | ')
        .fontSize(10)
        .fontColor(ProteusHomeColors.TEXT_DIM)
      ProteusHomeInlineLink({ label: 'New Project', onAction: () => this.startNewProjectWizard() })
      Text(' | ')
        .fontSize(10)
        .fontColor(ProteusHomeColors.TEXT_DIM)
      ProteusHomeInlineLink({ label: 'New Flowchart', onAction: () => { this.openFlowchartUnavailable(); } })
      Text(' | ')
        .fontSize(10)
        .fontColor(ProteusHomeColors.TEXT_DIM)
      ProteusHomeInlineLink({ label: 'Open Sample Design', onAction: () => this.openSampleList() })
    }
    .width('100%')
    .padding({ left: 8, top: 6, bottom: 4 })
    .alignItems(VerticalAlign.Center)
  }

  @Builder
  RightWorkspace() {
    Column({ space: 6 }) {
      ProteusHomePanel({ title: 'Start', panelWeight: 6 }) {
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
                .padding(8)
            } else if (this.listEntries().length === 0) {
              Column() {
                Text(this.showSamples ? '(no samples)' : '(no recent projects)')
                  .fontSize(10)
                  .fontColor(ProteusHomeColors.TEXT_DIM)
                if (!this.showSamples) {
                  ProteusHomeInlineLink({
                    label: 'New Project…',
                    onAction: () => this.startNewProjectWizard()
                  })
                    .margin({ top: 4 })
                }
              }
              .width('100%')
              .padding(8)
              .alignItems(HorizontalAlign.Start)
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
              }
              .width('100%')
              .layoutWeight(1)
              .scrollBar(BarState.Auto)
            }
          }
          .width('100%')
          .layoutWeight(1)
          .margin({ left: 8, right: 8, bottom: 4 })
          .backgroundColor(ProteusHomeColors.PANEL_BG)
          .border({ width: 1, color: ProteusHomeColors.LISTBOX_BORDER })

          Row() {
            ProteusHomeDownloadBtn({
              label: 'Open',
              primary: true,
              btnEnabled: this.canOpenSelected(),
              onAction: () => this.openSelected()
            })
          }
          .width('100%')
          .padding({ left: 8, right: 8, bottom: 8 })
        }
        .width('100%')
        .height('100%')
        .alignItems(HorizontalAlign.Start)
      }

      ProteusHomePanel({ title: 'News', panelWeight: 4, highlighted: this.newsHighlight }) {
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
