/**
 * AI 面板 — API 配置（默认折叠）+ 提示词一键生成 + Claude/Cursor 风格流式日志
 */
import { AppService, AiGenLogEntry, AiGenerateMode, AiGenerateStrategy } from '../services/AppService';
import { AiApiConfig, AiProviderType, LoadBalanceMode, Logger, INSTR_TRACE_TAG,
  ClarificationQuestion, ClarificationAnswer, Result } from 'common';
import { AiApiConfigSection } from './AiApiConfigSection';
import { ProteusClassicBtn, ProteusChipGrid, ProteusTextArea, ProteusTextInput } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';

interface ApiFormatOption {
  label: string;
  value: string;
}

@Component
export struct AiSettingsPanel {
  @Link statusMessage: string;
  @Link aiGenerating: boolean;
  @Link aiProgress: number;
  @Link aiStage: string;
  @State apiList: AiApiConfig[] = [];
  @State showAddForm: boolean = false;
  @State apiSectionExpanded: boolean = false;
  @State apiRefreshTick: number = 0;
  @State promptText: string = '';
  @State logs: AiGenLogEntry[] = [];
  @State showStrategyDialog: boolean = false;
  @State showModeDialog: boolean = false;
  @State pendingStrategy: AiGenerateStrategy = 'oneshot';
  @State showSelfCheckDialog: boolean = false;
  @State selfCheckSummary: string = '';
  @State selfCheckCount: number = 0;
  @State clarifyQuestions: ClarificationQuestion[] = [];
  @State clarifyChoiceById: Map<string, string> = new Map();
  @State clarifyFreeById: Map<string, string> = new Map();
  @State pendingClarifyPrompt: string = '';
  @State pendingClarifyMode: AiGenerateMode = 'replace';
  @State pendingClarifyStrategy: AiGenerateStrategy = 'oneshot';
  @State enableReasoning: boolean = false;
  @State newApiName: string = '';
  @State newApiKey: string = '';
  @State newApiModel: string = '';
  @State newApiUrl: string = '';
  @State newApiFormat: string = 'openai';
  @State newAuthField: string = '';
  @State selectedProvider: AiProviderType = AiProviderType.DEEPSEEK;
  @State apiFormatIdx: number = 2;
  /** 非空表示正在编辑已保存配置（保存走 updateApi） */
  @State editingApiId: string = '';
  @State defaultApiId: string = '';
  @State providerIdx: number = 0;
  @State selectedStratIdx: number = 0;
  /** ForEach 仅用 id 作 key 时，model/name 变更不会重建子项；递增以强制刷新 */
  @State apiListRev: number = 0;

  private appService: AppService = AppService.getInstance();
  private providers: string[] = ['DeepSeek', '通义千问', '豆包', 'OpenAI', 'Ollama', 'Claude', 'Gemini', '自定义'];
  private providerTypes: AiProviderType[] = [
    AiProviderType.DEEPSEEK, AiProviderType.QWEN, AiProviderType.DOUBAO,
    AiProviderType.OPENAI, AiProviderType.OLLAMA,
    AiProviderType.CLAUDE, AiProviderType.GEMINI, AiProviderType.CUSTOM
  ];
  private apiFormats: ApiFormatOption[] = [
    { label: 'Anthropic Messages (原生)', value: 'anthropic' },
    { label: 'OpenAI Chat Completions', value: 'openai' },
    { label: 'DeepSeek Chat', value: 'deepseek' },
    { label: 'Ollama (原生)', value: 'ollama' }
  ];
  private loadBalanceLabels: string[] = ['指定默认', '优先级', '轮询', '故障切换'];
  private loadBalanceModes: LoadBalanceMode[] = [
    LoadBalanceMode.SINGLE_DEFAULT, LoadBalanceMode.PRIORITY,
    LoadBalanceMode.ROUND_ROBIN, LoadBalanceMode.FAILOVER
  ];

  aboutToAppear(): void {
    this.refreshList();
    if (this.defaultApiId.length > 0) {
      this.appService.aiApiManager.setLoadBalanceStrategy(LoadBalanceMode.SINGLE_DEFAULT);
      this.selectedStratIdx = 0;
    } else {
      // 与 AiApiManagerImpl 默认 PRIORITY 对齐
      this.selectedStratIdx = 1;
    }
    this.logs = this.appService.getAiGenLogs();
    this.appService.onAiGenLogsChanged = (entries: AiGenLogEntry[]) => {
      this.logs = entries;
    };
    this.appService.onAiSelfCheckNeeded = (count: number, summary: string) => {
      this.selfCheckCount = count;
      this.selfCheckSummary = summary;
      this.showSelfCheckDialog = true;
    };
    this.appService.onAiClarificationNeeded = (questions, prompt, mode, strategy) => {
      this.clarifyQuestions = questions;
      this.clarifyChoiceById = new Map();
      this.clarifyFreeById = new Map();
      this.pendingClarifyPrompt = prompt;
      this.pendingClarifyMode = mode;
      this.pendingClarifyStrategy = strategy;
      Logger.info(INSTR_TRACE_TAG, `[AI_UI] clarify Ask cards n=${questions.length}`);
    };
    if (this.appService.isAiSelfCheckPromptPending()) {
      this.showSelfCheckDialog = true;
      this.selfCheckSummary = '检测到首次布局问题';
    }
    this.enableReasoning = this.appService.aiEnableReasoning;
  }

  refreshList(): void {
    this.apiList = this.appService.aiApiManager.listApis();
    const def = this.appService.aiApiManager.getDefaultApi();
    this.defaultApiId = (def.success && def.data) ? def.data.id : '';
    this.apiListRev++;
  }

  private resetApiForm(): void {
    this.editingApiId = '';
    this.newApiName = '';
    this.newApiKey = '';
    this.newApiUrl = '';
    this.newApiModel = '';
    this.newAuthField = this.selectedProvider === AiProviderType.CLAUDE ? 'x-api-key' : '';
  }

  private beginEditApi(api: AiApiConfig): void {
    // 从 manager 重取，避免 ForEach 闭包里的旧快照把表单冲回旧 model/name
    let src: AiApiConfig = api;
    const fresh = this.appService.aiApiManager.getApi(api.id);
    if (fresh.success && fresh.data) {
      src = fresh.data;
    }
    this.editingApiId = src.id;
    this.showAddForm = true;
    this.newApiName = src.name;
    this.newApiKey = '';
    this.newApiUrl = src.baseUrl;
    this.newApiModel = src.model;
    this.selectedProvider = src.provider;
    let pIdx = 0;
    for (let i = 0; i < this.providerTypes.length; i++) {
      if (this.providerTypes[i] === src.provider) {
        pIdx = i;
        break;
      }
    }
    this.providerIdx = pIdx;
    // remark: apiFormat=xxx
    let fmt = 'openai';
    const remark = src.remark ?? '';
    const marker = 'apiFormat=';
    const mi = remark.indexOf(marker);
    if (mi >= 0) {
      fmt = remark.substring(mi + marker.length).trim();
      const sp = fmt.indexOf(' ');
      if (sp >= 0) {
        fmt = fmt.substring(0, sp);
      }
    } else if (src.provider === AiProviderType.CLAUDE) {
      fmt = 'anthropic';
    } else if (src.provider === AiProviderType.DEEPSEEK) {
      fmt = 'deepseek';
    } else if (src.provider === AiProviderType.OLLAMA) {
      fmt = 'ollama';
    }
    this.newApiFormat = fmt;
    let fIdx = 1;
    for (let i = 0; i < this.apiFormats.length; i++) {
      if (this.apiFormats[i].value === fmt) {
        fIdx = i;
        break;
      }
    }
    this.apiFormatIdx = fIdx;
    this.newAuthField = '';
    const ch = src.customHeaders;
    if (ch) {
      // ArkTS：不用 Object.keys；按常见认证头探测
      if (ch['x-api-key'] !== undefined) {
        this.newAuthField = 'x-api-key';
      } else if (ch['Authorization'] !== undefined) {
        this.newAuthField = 'Authorization';
      } else if (ch['api-key'] !== undefined) {
        this.newAuthField = 'api-key';
      }
    } else if (src.provider === AiProviderType.CLAUDE) {
      this.newAuthField = 'x-api-key';
    }
    this.statusMessage = `正在编辑 ${src.name}（Key 留空则保留原值）`;
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] UI edit begin id=${src.id} name=${src.name} model=${src.model}`);
  }

  private selectAsDefault(api: AiApiConfig): void {
    if (!api.enabled) {
      this.appService.aiApiManager.enableApi(api.id);
    }
    const setDef = this.appService.aiApiManager.setDefaultApi(api.id);
    if (!setDef.success) {
      this.statusMessage = setDef.error ?? '设为默认失败';
      return;
    }
    this.appService.aiApiManager.setLoadBalanceStrategy(LoadBalanceMode.SINGLE_DEFAULT);
    this.selectedStratIdx = 0;
    this.appService.syncAiApiConfigsToProject();
    this.refreshList();
    Logger.info(INSTR_TRACE_TAG, `[AI_API] UI select default id=${api.id} name=${api.name}`);
    this.statusMessage = `已选用 ${api.name}（指定默认）`;
  }

  private saveApiFromForm(): void {
    const isEdit = this.editingApiId.length > 0;
    if (isEdit) {
      const keyTrim = this.newApiKey.trim();
      // Key 留空：完全不传 apiKey，避免冲掉已存密钥
      const nameVal = this.newApiName.trim().length > 0 ? this.newApiName.trim() : this.newApiName;
      const urlVal = this.newApiUrl.trim().length > 0 ? this.newApiUrl.trim() : this.newApiUrl;
      const modelVal = this.newApiModel.trim().length > 0 ? this.newApiModel.trim() : this.newApiModel;
      const remarkVal = this.newApiFormat.length > 0 ? `apiFormat=${this.newApiFormat}` : '';
      let upd: Result<void> = { success: false, error: 'update not called' };
      if (keyTrim.length > 0 && keyTrim !== '***') {
        const headers: Record<string, string> = {};
        let useHeaders = false;
        if (this.newAuthField.length > 0) {
          const lower = this.newAuthField.toLowerCase();
          if (lower !== 'bearer' && lower !== 'authorization') {
            headers[this.newAuthField] = keyTrim;
            useHeaders = true;
          }
        }
        if (useHeaders) {
          upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
            name: nameVal,
            provider: this.selectedProvider,
            baseUrl: urlVal,
            model: modelVal,
            apiKey: keyTrim,
            customHeaders: headers,
            remark: remarkVal
          });
        } else {
          upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
            name: nameVal,
            provider: this.selectedProvider,
            baseUrl: urlVal,
            model: modelVal,
            apiKey: keyTrim,
            remark: remarkVal
          });
        }
      } else {
        upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
          name: nameVal,
          provider: this.selectedProvider,
          baseUrl: urlVal,
          model: modelVal,
          remark: remarkVal
        });
      }
      if (!upd.success) {
        Logger.error(INSTR_TRACE_TAG,
          `[AI_API] update FAILED id=${this.editingApiId}: ${upd.error}`);
        this.statusMessage = upd.error ?? '更新 API 失败（未改动 Key）';
        return;
      }
      const synced = this.appService.syncAiApiConfigsToProject();
      if (!synced) {
        Logger.error(INSTR_TRACE_TAG,
          `[AI_API] update OK but vault sync FAIL id=${this.editingApiId}`);
        this.statusMessage = '配置已更新到内存，但金库保存失败（Key 仍保留，请重试）';
        this.refreshList();
        return;
      }
      Logger.info(INSTR_TRACE_TAG,
        `[AI_API] updated id=${this.editingApiId} name=${this.newApiName}` +
        ` provider=${this.selectedProvider} model=${this.newApiModel}` +
        ` url=${this.newApiUrl} keyChanged=${keyTrim.length > 0}`);
      this.refreshList();
      this.showAddForm = false;
      this.resetApiForm();
      this.statusMessage = '已更新并同步 API 配置';
      return;
    }

    const tmpl = this.appService.aiApiManager.createFromTemplate(
      this.selectedProvider, this.newApiName || 'New API');
    if (!tmpl.success || !tmpl.data) {
      Logger.error(INSTR_TRACE_TAG, '[AI_API] save: createFromTemplate failed');
      this.statusMessage = '创建 API 配置失败';
      return;
    }
    const config = tmpl.data;
    config.apiKey = this.newApiKey;
    config.model = this.newApiModel || config.model;
    config.name = this.newApiName || config.name || 'New API';
    config.baseUrl = this.newApiUrl || config.baseUrl;
    if (this.newAuthField.length > 0 && this.newApiKey.length > 0) {
      const lower = this.newAuthField.toLowerCase();
      if (lower !== 'bearer' && lower !== 'authorization') {
        const h: Record<string, string> = {};
        h[this.newAuthField] = this.newApiKey;
        config.customHeaders = h;
      }
    }
    if (this.newApiFormat.length > 0) {
      config.remark = `apiFormat=${this.newApiFormat}`;
    }
    const addResult = this.appService.aiApiManager.addApi(config);
    if (!addResult.success) {
      Logger.error(INSTR_TRACE_TAG,
        `[AI_API] save FAILED id=${config.id}: ${addResult.error}`);
      this.statusMessage = addResult.error ?? '保存 API 失败';
      return;
    }
    const syncedAdd = this.appService.syncAiApiConfigsToProject();
    Logger.info(INSTR_TRACE_TAG,
      `[AI_API] saved id=${config.id} name=${config.name}` +
      ` provider=${config.provider} model=${config.model}` +
      ` url=${config.baseUrl} keyLen=${config.apiKey.length} vault=${syncedAdd}`);
    this.refreshList();
    this.showAddForm = false;
    this.resetApiForm();
    this.statusMessage = syncedAdd
      ? `已添加并同步 ${config.name}`
      : `已添加 ${config.name}，但金库保存失败请重试`;
  }

  private requestGenerate(): void {
    if (this.aiGenerating) {
      Logger.info(INSTR_TRACE_TAG, '[AI_UI] OP cancel_generate | user click');
      this.appService.cancelAiGenerate();
      return;
    }
    const q = this.promptText.trim();
    if (q.length === 0) {
      this.statusMessage = '请输入提示词';
      Logger.warn(INSTR_TRACE_TAG, '[AI_UI] OP generate_blocked | empty prompt');
      return;
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_UI] OP request_generate | promptLen=${q.length}`);
    this.showStrategyDialog = true;
    this.showModeDialog = false;
    this.showSelfCheckDialog = false;
  }

  private async submitClarification(): Promise<void> {
    const answers: ClarificationAnswer[] = [];
    for (let i = 0; i < this.clarifyQuestions.length; i++) {
      const q = this.clarifyQuestions[i];
      const free = (this.clarifyFreeById.get(q.id) ?? '').trim();
      const choiceRaw = this.clarifyChoiceById.get(q.id);
      if (free.length === 0 && (!choiceRaw || choiceRaw.length === 0)) {
        this.statusMessage = `请回答：${q.prompt}`;
        return;
      }
      const ans: ClarificationAnswer = { questionId: q.id };
      if (free.length > 0) {
        ans.freeText = free;
      }
      if (choiceRaw === 'A' || choiceRaw === 'B' || choiceRaw === 'C') {
        ans.choice = choiceRaw;
      }
      answers.push(ans);
    }
    const prompt = this.pendingClarifyPrompt.length > 0 ? this.pendingClarifyPrompt : this.promptText;
    const mode = this.pendingClarifyMode;
    const strategy = this.pendingClarifyStrategy;
    this.clarifyQuestions = [];
    Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP submit_clarification n=${answers.length}`);
    const ok = await this.appService.aiGenerateCircuitFromPrompt(prompt, mode, strategy, answers);
    if (!ok) {
      this.statusMessage = this.statusMessage.length > 0 ? this.statusMessage : '继续生成失败';
    }
  }

  /** 在现有图基础上修改：跳过策略/落图方式对话框，强制 oneshot + edit */
  private requestEditExisting(): void {
    if (this.aiGenerating) {
      this.statusMessage = '请等待当前任务结束';
      return;
    }
    const q = this.promptText.trim();
    if (q.length === 0) {
      this.statusMessage = '请输入提示词（说明要改什么）';
      Logger.warn(INSTR_TRACE_TAG, '[AI_UI] OP edit_blocked | empty prompt');
      return;
    }
    const n = this.appService.getSchematicComponentCount();
    if (n <= 0) {
      this.statusMessage = '画布为空，请先「生成整图」或放置器件后再修改';
      Logger.warn(INSTR_TRACE_TAG, '[AI_UI] OP edit_blocked | empty canvas');
      return;
    }
    this.showStrategyDialog = false;
    this.showModeDialog = false;
    this.showSelfCheckDialog = false;
    this.pendingStrategy = 'oneshot';
    Logger.info(INSTR_TRACE_TAG,
      `[AI_UI] OP request_edit_existing | promptLen=${q.length} comps=${n}`);
    void this.runGenerate('edit');
  }

  private pickStrategy(strategy: AiGenerateStrategy): void {
    this.pendingStrategy = strategy;
    this.showStrategyDialog = false;
    // 模块并行始终从 create 起步（清多轮历史），避免被编辑模式强制改 oneshot
    if (strategy === 'modular') {
      this.appService.clearAiConversation();
    }
    Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP modular_strategy | strategy=${strategy}`);
    this.showModeDialog = true;
  }

  private async runGenerate(mode: AiGenerateMode): Promise<void> {
    this.showModeDialog = false;
    const q = this.promptText.trim();
    // 编辑模式强制 oneshot（与 AppService 一致；避免 UI 仍显示模块并行文案）
    const strategy: AiGenerateStrategy = mode === 'edit' ? 'oneshot' : this.pendingStrategy;
    this.statusMessage = mode === 'edit'
      ? 'AI 正在基于现有电路增量修改（请耐心等待）…'
      : (strategy === 'modular'
        ? '模块并行：整体设计中（请耐心等待）…'
        : 'AI 生成中（复杂电路可能需较长时间，请耐心等待）…');
    Logger.info(INSTR_TRACE_TAG,
      `[AI_UI] OP run_generate | mode=${mode} strategy=${strategy} promptLen=${q.length}`);
    const ok = await this.appService.aiGenerateCircuitFromPrompt(q, mode, strategy);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_UI] OP run_generate_done | mode=${mode} strategy=${strategy} ok=${ok}`);
    if (ok) {
      this.statusMessage = mode === 'edit'
        ? 'AI 已按提示词更新现有电路'
        : (strategy === 'modular' ? '模块并行生图完成' : 'AI 整图生成完成');
    } else {
      this.statusMessage = 'AI 生成失败，请检查 API 配置与 instr_trace 日志';
    }
  }

  private async runSelfCheck(): Promise<void> {
    this.statusMessage = 'AI 自检修复中…';
    Logger.info(INSTR_TRACE_TAG, '[AI_UI] OP run_self_check | start');
    const ok = await this.appService.aiSelfCheckAndFix();
    Logger.info(INSTR_TRACE_TAG, `[AI_UI] OP run_self_check_done | ok=${ok}`);
    this.statusMessage = ok ? '自检修复完成' : '自检完成（仍有问题或已跳过）';
  }

  private bubbleBg(role: string): string {
    if (role === 'user') {
      return ProteusColors.SELECTED;
    }
    if (role === 'system') {
      return ProteusColors.INPUT_READONLY_BG;
    }
    return ProteusColors.CANVAS_BG;
  }

  private bubbleFg(role: string): string {
    if (role === 'user') {
      return '#FFFFFF';
    }
    return ProteusColors.TEXT_PRIMARY;
  }

  build() {
    Column() {
      // ---- Cline 顶栏：任务 / 进度 / API 齿轮 ----
      Row() {
        Text('AI 助手')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
        if (this.aiGenerating) {
          Text(`${this.aiProgress}%`)
            .fontSize(10)
            .fontColor(ProteusColors.TEXT_LABEL)
            .margin({ right: 8 })
        }
        Text(this.apiSectionExpanded ? '▾ API' : '⚙ API')
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_LABEL)
          .padding({ left: 6, right: 6, top: 4, bottom: 4 })
          .onClick(() => {
            this.apiSectionExpanded = !this.apiSectionExpanded;
            if (this.apiSectionExpanded) {
              this.apiRefreshTick++;
            }
          })
        if (this.aiGenerating) {
          Text('取消')
            .fontSize(10)
            .fontColor(ProteusColors.ERC_ERR)
            .padding({ left: 8, right: 4, top: 4, bottom: 4 })
            .onClick(() => {
              this.appService.cancelAiGenerate();
            })
        }
      }
      .width('100%')
      .padding({ left: 10, right: 8, top: 8, bottom: 6 })

      if (this.aiGenerating && this.aiStage.length > 0) {
        Text(this.aiStage)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .width('100%')
          .padding({ left: 10, right: 8, bottom: 4 })
      }

      if (this.apiSectionExpanded) {
        AiApiConfigSection({
          statusMessage: $statusMessage,
          refreshTick: this.apiRefreshTick
        })
        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')
      }

      // ---- 中部对话时间线 ----
      List({ space: 6 }) {
        ForEach(this.logs, (entry: AiGenLogEntry) => {
          ListItem() {
            Column() {
              Text(entry.role === 'user' ? '你' : (entry.role === 'system' ? '系统' : 'AI'))
                .fontSize(9)
                .fontColor(ProteusColors.TEXT_SECONDARY)
                .width('100%')
                .textAlign(entry.role === 'user' ? TextAlign.End : TextAlign.Start)
              Text(entry.text)
                .fontSize(10)
                .fontColor(this.bubbleFg(entry.role))
                .fontFamily('monospace')
                .width('100%')
            }
            .width(entry.role === 'user' ? '88%' : '100%')
            .padding({ left: 8, right: 8, top: 6, bottom: 6 })
            .backgroundColor(this.bubbleBg(entry.role))
            .border({
              width: 1,
              color: entry.role === 'assistant' ? ProteusColors.DIVIDER : 'transparent'
            })
            .alignSelf(entry.role === 'user' ? ItemAlign.End : ItemAlign.Start)
          }
        }, (entry: AiGenLogEntry) => entry.id)

        // Ask 澄清卡片（嵌入时间线）
        if (this.clarifyQuestions.length > 0 && !this.aiGenerating) {
          ListItem() {
            Column({ space: 10 }) {
              Text('需要澄清后再生成')
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(ProteusColors.TEXT_PRIMARY)
                .fontWeight(FontWeight.Medium)
                .width('100%')
              ForEach(this.clarifyQuestions, (q: ClarificationQuestion) => {
                Column({ space: 6 }) {
                  Text(q.prompt)
                    .fontSize(10)
                    .fontColor(ProteusColors.TEXT_PRIMARY)
                    .width('100%')
                  ProteusClassicBtn({
                    label: `A. ${q.optionA}`,
                    widthVal: '100%',
                    onAction: () => {
                      this.clarifyChoiceById.set(q.id, 'A');
                      this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                    }
                  })
                  ProteusClassicBtn({
                    label: `B. ${q.optionB}`,
                    widthVal: '100%',
                    onAction: () => {
                      this.clarifyChoiceById.set(q.id, 'B');
                      this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                    }
                  })
                  ProteusClassicBtn({
                    label: `C. ${q.optionC}`,
                    widthVal: '100%',
                    onAction: () => {
                      this.clarifyChoiceById.set(q.id, 'C');
                      this.clarifyChoiceById = new Map(this.clarifyChoiceById);
                    }
                  })
                  ProteusTextArea({
                    placeholder: 'D. 补充说明（可选，留空跳过）',
                    text: this.clarifyFreeById.get(q.id) ?? '',
                    areaHeight: 48,
                    isEnabled: true,
                    onChange: (v: string) => {
                      this.clarifyFreeById.set(q.id, v);
                      this.clarifyFreeById = new Map(this.clarifyFreeById);
                    }
                  })
                  Text(`已选: ${this.clarifyChoiceById.get(q.id) ?? '无'}`)
                    .fontSize(9)
                    .fontColor(ProteusColors.TEXT_SECONDARY)
                    .width('100%')
                }
                .width('100%')
                .padding(8)
                .backgroundColor(ProteusColors.SIDEBAR_TAB_ACTIVE_BG)
              }, (q: ClarificationQuestion) => q.id)
              ProteusClassicBtn({
                label: '继续生成',
                widthVal: '100%',
                onAction: () => {
                  void this.submitClarification();
                }
              })
            }
            .width('100%')
            .padding(8)
          }
        }

        if (this.showSelfCheckDialog && !this.aiGenerating) {
          ListItem() {
            Column({ space: 8 }) {
              Text('首次布局检测到问题')
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(ProteusColors.TEXT_PRIMARY)
                .fontWeight(FontWeight.Medium)
                .width('100%')
              Text(this.selfCheckSummary.length > 0
                ? this.selfCheckSummary
                : '是否根据自检日志与错误进行修复？')
                .fontSize(10)
                .fontColor(ProteusColors.TEXT_LABEL)
                .width('100%')
              ProteusClassicBtn({
                label: '自检修复',
                widthVal: '100%',
                onAction: () => {
                  this.showSelfCheckDialog = false;
                  void this.runSelfCheck();
                }
              })
              ProteusClassicBtn({
                label: '暂不',
                widthVal: '100%',
                onAction: () => {
                  this.showSelfCheckDialog = false;
                  this.appService.dismissAiSelfCheckPrompt();
                  this.statusMessage = '已跳过自检修复';
                }
              })
            }
            .width('100%')
            .padding(10)
            .backgroundColor(ProteusColors.INPUT_READONLY_BG)
            .border({ width: 1, color: ProteusColors.ERC_WARN })
          }
        }

        if (this.showStrategyDialog) {
          ListItem() {
            Column({ space: 8 }) {
              Text('请选择生成方式：')
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(ProteusColors.TEXT_PRIMARY)
                .width('100%')
              Text(this.appService.getAiConversationRound() > 0
                ? '复杂电路建议「模块并行」（将开启新一轮并行生图）。「整图一次」可继续多轮编辑。'
                : '复杂电路建议「模块并行」：先整体设计连接边界，再多路并行生图后合并。')
                .fontSize(9)
                .fontColor(ProteusColors.TEXT_SECONDARY)
                .width('100%')
              ProteusClassicBtn({
                label: '整图一次',
                widthVal: '100%',
                onAction: () => {
                  this.pickStrategy('oneshot');
                }
              })
              ProteusClassicBtn({
                label: '模块并行（先整体设计+边界）',
                widthVal: '100%',
                onAction: () => {
                  this.pickStrategy('modular');
                }
              })
              ProteusClassicBtn({
                label: '取消',
                widthVal: '100%',
                onAction: () => {
                  this.showStrategyDialog = false;
                }
              })
            }
            .width('100%')
            .padding(10)
            .backgroundColor(ProteusColors.INPUT_READONLY_BG)
            .border({ width: 1, color: ProteusColors.SELECTED })
          }
        }

        if (this.showModeDialog) {
          ListItem() {
            Column({ space: 8 }) {
              Text(this.pendingStrategy === 'modular'
                ? '模块并行 · 画布处理方式：'
                : '画布上已有电路时，请选择：')
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(ProteusColors.TEXT_PRIMARY)
                .width('100%')
              ProteusClassicBtn({
                label: '替换整图',
                widthVal: '100%',
                onAction: () => {
                  void this.runGenerate('replace');
                }
              })
              ProteusClassicBtn({
                label: '追加到空白区',
                widthVal: '100%',
                onAction: () => {
                  void this.runGenerate('append');
                }
              })
              ProteusClassicBtn({
                label: '在现有图上 AI 更改',
                widthVal: '100%',
                onAction: () => {
                  void this.runGenerate('edit');
                }
              })
              Text('与底栏「修改现有图」相同：保留当前电路，按提示词增量修改（自动整图一次）')
                .fontSize(9)
                .fontColor(ProteusColors.TEXT_SECONDARY)
                .width('100%')
              ProteusClassicBtn({
                label: '取消',
                widthVal: '100%',
                onAction: () => {
                  this.showModeDialog = false;
                }
              })
            }
            .width('100%')
            .padding(10)
            .backgroundColor(ProteusColors.INPUT_READONLY_BG)
            .border({ width: 1, color: ProteusColors.SELECTED })
          }
        }
      }
      .layoutWeight(1)
      .width('100%')
      .padding({ left: 6, right: 6, bottom: 4 })
      .scrollBar(BarState.Auto)

      Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

      // ---- Cline 底栏：输入 + 操作 ----
      Column({ space: 4 }) {
        ProteusTextArea({
          placeholder: '描述电路需求… 例如：STM32F103 最小系统 + LED 闪烁',
          text: this.promptText,
          areaHeight: ProteusDimens.TEXTAREA_MIN_HEIGHT,
          isEnabled: !this.aiGenerating,
          onChange: (v: string) => { this.promptText = v; }
        })
          .margin({ left: 8, right: 8, top: 6 })

        Row() {
          Text(this.enableReasoning ? '● 推理开' : '○ 推理关')
            .fontSize(10)
            .fontColor(this.enableReasoning ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY)
            .padding({ left: 8, right: 8, top: 4, bottom: 4 })
            .onClick(() => {
              this.enableReasoning = !this.enableReasoning;
              this.appService.aiEnableReasoning = this.enableReasoning;
              Logger.info(INSTR_TRACE_TAG,
                `[AI_UI] enableReasoning=${this.enableReasoning}`);
              this.statusMessage = this.enableReasoning
                ? '已开启推理：选型/建网/布线允许 thinking，并隔离 JSON（较慢）'
                : '已关闭推理（默认，利于纯 JSON）';
            })
          Text('严格质量 · 禁残留交付')
            .fontSize(9)
            .fontColor(ProteusColors.ERC_OK)
            .padding({ right: 8 })
          Text('难需求可开推理')
            .fontSize(9)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .layoutWeight(1)
        }
        .width('100%')
        .padding({ left: 4, right: 8 })

        Row({ space: 6 }) {
          ProteusClassicBtn({
            label: this.aiGenerating ? '取消' : '生成整图',
            widthVal: '48%',
            onAction: () => {
              this.requestGenerate();
            }
          })
          ProteusClassicBtn({
            label: '修改现有图',
            widthVal: '48%',
            onAction: () => {
              this.requestEditExisting();
            }
          })
        }
        .width('100%')
        .padding({ left: 8, right: 8 })

        Row({ space: 6 }) {
          ProteusClassicBtn({
            label: 'AI自检修复',
            widthVal: '70%',
            onAction: () => {
              if (this.aiGenerating) {
                this.statusMessage = '请等待当前任务结束';
                return;
              }
              this.showStrategyDialog = false;
              this.showModeDialog = false;
              void this.runSelfCheck();
            }
          })
          ProteusClassicBtn({
            label: '清空',
            widthVal: '26%',
            onAction: () => {
              this.appService.clearAiGenLogs();
            }
          })
        }
        .width('100%')
        .padding({ left: 8, right: 8, bottom: 8 })
      }
      .width('100%')
      .backgroundColor(ProteusColors.INPUT_READONLY_BG)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
  }

  @Builder
  ApiConfigSection() {
    Column() {
      Row() {
        Text('AI API 管理')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
          .padding({ left: 8, top: 4, bottom: 4 })
        ProteusClassicBtn({
          label: this.showAddForm ? '收起' : '+ 添加',
          widthVal: 64,
          onAction: () => {
            if (this.showAddForm) {
              this.showAddForm = false;
              this.resetApiForm();
            } else {
              this.resetApiForm();
              this.showAddForm = true;
            }
          }
        })
      }
      .width('100%')
      .padding({ right: 6 })

      if (this.showAddForm) {
        Column({ space: 4 }) {
          Text(this.editingApiId.length > 0 ? '编辑已保存 API' : '选择平台')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width('100%')

          ProteusChipGrid({
            labels: this.providers,
            selectedIdx: this.providerIdx,
            colsPerRow: 3,
            onSelect: (idx: number) => {
              const nextProvider = this.providerTypes[idx];
              const providerChanged = nextProvider !== this.selectedProvider;
              this.providerIdx = idx;
              this.selectedProvider = nextProvider;
              // 编辑中复点同一平台勿覆盖已改的模型名；新建或真正切换厂商才套模板
              if (this.editingApiId.length === 0 || providerChanged) {
                const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                if (tmpl.success && tmpl.data) {
                  this.newApiModel = tmpl.data.model;
                  this.newApiUrl = tmpl.data.baseUrl;
                }
              }
              // 按厂商同步协议与认证头，避免 DeepSeek 误带 ANTHROPIC_AUTH_TOKEN
              if (this.selectedProvider === AiProviderType.CLAUDE) {
                this.apiFormatIdx = 0;
                this.newApiFormat = 'anthropic';
                this.newAuthField = 'x-api-key';
              } else if (this.selectedProvider === AiProviderType.OLLAMA) {
                this.apiFormatIdx = 3;
                this.newApiFormat = 'ollama';
                this.newAuthField = '';
              } else if (this.selectedProvider === AiProviderType.DEEPSEEK) {
                this.apiFormatIdx = 2;
                this.newApiFormat = 'deepseek';
                this.newAuthField = '';
              } else {
                this.apiFormatIdx = 1;
                this.newApiFormat = 'openai';
                this.newAuthField = '';
              }
            }
          })
          .padding({ left: 8, right: 8, top: 2, bottom: 4 })

          Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 2 })

          Row() {
            Text('官网链接')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            ProteusTextInput({
              placeholder: 'https://example.com （可选）',
              text: this.newApiUrl,
              onChange: (v: string) => { this.newApiUrl = v; }
            })
              .layoutWeight(1)
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          Row() {
            Text('API Key')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            ProteusTextInput({
              placeholder: this.editingApiId.length > 0 ? '留空则保留原 Key' : 'sk-...',
              text: this.newApiKey,
              password: true,
              onChange: (v: string) => { this.newApiKey = v; }
            })
              .layoutWeight(1)
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          Row() {
            Text('API 格式')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            Select(this.buildApiFormatOptions())
              .selected(this.apiFormatIdx)
              .value(this.apiFormats[this.apiFormatIdx].label)
              .font({ size: ProteusFonts.INPUT }).fontColor(ProteusColors.TEXT_PRIMARY)
              .backgroundColor(ProteusColors.CANVAS_BG)
              .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT)
              .onSelect((idx: number) => {
                this.apiFormatIdx = idx;
                this.newApiFormat = this.apiFormats[idx].value;
              })
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          Row() {
            Text('认证字段')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            ProteusTextInput({
              placeholder: 'x-api-key（Claude）或留空用 Bearer',
              text: this.newAuthField,
              onChange: (v: string) => { this.newAuthField = v; }
            })
              .layoutWeight(1)
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          Row() {
            Text('模型名称')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            ProteusTextInput({
              placeholder: 'claude-sonnet-4-6',
              text: this.newApiModel,
              onChange: (v: string) => { this.newApiModel = v; }
            })
              .layoutWeight(1)
              .key(`api_model_input_${this.editingApiId}`)
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          ProteusClassicBtn({
            label: this.editingApiId.length > 0 ? '更新 API' : '保存 API',
            widthVal: '100%',
            onAction: () => {
              this.saveApiFromForm();
            }
          })
        }
        .padding({ left: 6, right: 6, top: 4, bottom: 4 })
        .backgroundColor(ProteusColors.INPUT_READONLY_BG)
        .border({ width: 1, color: ProteusColors.DIVIDER })
        .margin({ left: 4, right: 4, top: 2 })
      }

      Text('负载均衡策略')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .margin({ left: 6, top: 4 })
        .alignSelf(ItemAlign.Start)

      ProteusChipGrid({
        labels: this.loadBalanceLabels,
        selectedIdx: this.selectedStratIdx,
        colsPerRow: 3,
        onSelect: (idx: number) => {
          this.selectedStratIdx = idx;
          this.appService.aiApiManager.setLoadBalanceStrategy(this.loadBalanceModes[idx]);
          this.statusMessage = `负载均衡: ${this.loadBalanceLabels[idx]}`;
        }
      })
      .width('100%')
      .padding({ left: 8, right: 8, top: 2, bottom: 4 })

      Row() {
        Text('已配置 API')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
        Blank()
        Text(`${this.apiList.length} 个`)
          .fontSize(9).fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .width('100%').padding({ left: 6, right: 6, top: 4 })

      Column({ space: 2 }) {
        ForEach(this.apiList, (api: AiApiConfig) => {
          Column() {
            Row() {
              Text(api.name)
                .fontSize(10).fontColor(ProteusColors.TEXT_PRIMARY).fontWeight(FontWeight.Medium)
                .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
              if (api.id === this.defaultApiId) {
                Text('当前')
                  .fontSize(8)
                  .fontColor(ProteusColors.ERC_OK)
                  .margin({ left: 4, right: 4 })
              }
              Text(api.enabled ? '●' : '○')
                .fontSize(8)
                .fontColor(api.enabled ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY)
                .margin({ left: 4 })
            }.width('100%')

            Text(`${api.model}`)
              .fontSize(9).fontColor(ProteusColors.TEXT_LABEL).width('100%')
              .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })

            Row({ space: 3 }) {
              ProteusClassicBtn({
                label: api.id === this.defaultApiId ? '已选' : '选用',
                widthVal: 44,
                onAction: () => {
                  this.selectAsDefault(api);
                }
              })
              ProteusClassicBtn({
                label: '编辑', widthVal: 44,
                onAction: () => {
                  this.beginEditApi(api);
                }
              })
              ProteusClassicBtn({
                label: '测试', widthVal: 44,
                onAction: async () => {
                  this.statusMessage = `测试 ${api.name}...`;
                  Logger.info(INSTR_TRACE_TAG,
                    `[AI_API] UI test click id=${api.id} name=${api.name}`);
                  const result = await this.appService.aiApiManager.testConnection(api.id);
                  Logger.info(INSTR_TRACE_TAG,
                    `[AI_API] UI test done id=${api.id} ok=${result.success}` +
                    ` err=${result.error ?? ''}`);
                  this.statusMessage = result.success
                    ? `${api.name} 连接成功`
                    : `${api.name} 失败: ${result.error ?? ''}`;
                  this.appService.syncAiApiConfigsToProject();
                  this.refreshList();
                }
              })
              ProteusClassicBtn({
                label: api.enabled ? '禁用' : '启用', widthVal: 44,
                onAction: () => {
                  if (api.enabled) {
                    this.appService.aiApiManager.disableApi(api.id);
                  } else {
                    this.appService.aiApiManager.enableApi(api.id);
                  }
                  this.appService.syncAiApiConfigsToProject();
                  this.refreshList();
                }
              })
              ProteusClassicBtn({
                label: '删', widthVal: 36,
                onAction: () => {
                  this.appService.aiApiManager.removeApi(api.id);
                  this.appService.syncAiApiConfigsToProject();
                  if (this.editingApiId === api.id) {
                    this.showAddForm = false;
                    this.resetApiForm();
                  }
                  Logger.info(INSTR_TRACE_TAG, `[AI_API] removed id=${api.id}`);
                  this.refreshList();
                }
              })
            }.width('100%')
          }
          .width('100%')
          .padding({ left: 6, right: 6, top: 4, bottom: 4 })
          .backgroundColor(ProteusColors.INPUT_READONLY_BG)
          .border({ width: 1, color: ProteusColors.DIVIDER })
        }, (api: AiApiConfig) =>
          `${api.id}_${api.model}_${api.name}_${api.enabled}_${this.apiListRev}`)
      }
      .width('100%')
      .padding({ left: 4, right: 4, top: 2, bottom: 6 })
    }
    .width('100%')
  }

  private buildApiFormatOptions(): SelectValueOption[] {
    const opts: SelectValueOption[] = [];
    for (let i = 0; i < this.apiFormats.length; i++) {
      const opt: SelectValueOption = { value: this.apiFormats[i].label };
      opts.push(opt);
    }
    return opts;
  }
}

interface SelectValueOption {
  value: string;
}
