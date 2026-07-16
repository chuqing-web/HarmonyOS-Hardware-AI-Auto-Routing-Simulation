/**
 * AI 面板 — API 配置（默认折叠）+ 提示词一键生成 + Claude/Cursor 风格流式日志
 */
import { AppService, AiGenLogEntry, AiGenerateMode } from '../services/AppService';
import { AiApiConfig, AiProviderType, LoadBalanceMode, Logger, INSTR_TRACE_TAG } from 'common';
import { ProteusClassicBtn, ProteusChipGrid, ProteusSectionTitle } from './proteus/ProteusWidgets';
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
  @State promptText: string = '';
  @State logs: AiGenLogEntry[] = [];
  @State showModeDialog: boolean = false;
  @State showSelfCheckDialog: boolean = false;
  @State selfCheckSummary: string = '';
  @State selfCheckCount: number = 0;
  @State newApiName: string = '';
  @State newApiKey: string = '';
  @State newApiModel: string = '';
  @State newApiUrl: string = '';
  @State newApiFormat: string = 'anthropic';
  @State newAuthField: string = 'ANTHROPIC_AUTH_TOKEN';
  @State selectedProvider: AiProviderType = AiProviderType.DEEPSEEK;
  @State apiFormatIdx: number = 0;

  private appService: AppService = AppService.getInstance();
  private providerIdx: number = 0;
  private selectedStratIdx: number = 0;
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
  private loadBalanceLabels: string[] = ['优先级', '轮询', '故障切换'];

  aboutToAppear(): void {
    this.refreshList();
    this.logs = this.appService.getAiGenLogs();
    this.appService.onAiGenLogsChanged = (entries: AiGenLogEntry[]) => {
      this.logs = entries;
    };
    this.appService.onAiSelfCheckNeeded = (count: number, summary: string) => {
      this.selfCheckCount = count;
      this.selfCheckSummary = summary;
      this.showSelfCheckDialog = true;
    };
    if (this.appService.isAiSelfCheckPromptPending()) {
      this.showSelfCheckDialog = true;
      this.selfCheckSummary = '检测到首次布局问题';
    }
  }

  refreshList(): void {
    this.apiList = this.appService.aiApiManager.listApis();
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
    this.showModeDialog = true;
  }

  private async runGenerate(mode: AiGenerateMode): Promise<void> {
    this.showModeDialog = false;
    const q = this.promptText.trim();
    this.statusMessage = 'AI 生成中…';
    Logger.info(INSTR_TRACE_TAG,
      `[AI_UI] OP run_generate | mode=${mode} promptLen=${q.length}`);
    const ok = await this.appService.aiGenerateCircuitFromPrompt(q, mode);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_UI] OP run_generate_done | mode=${mode} ok=${ok}`);
    if (ok) {
      this.statusMessage = 'AI 整图生成完成';
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
      // ---- API 配置（默认折叠） ----
      Row() {
        Text(this.apiSectionExpanded ? '▾ API 配置' : '▸ API 配置')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
        Text(`${this.apiList.length} 个`)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 8, bottom: 6 })
      .onClick(() => {
        this.apiSectionExpanded = !this.apiSectionExpanded;
      })

      if (this.apiSectionExpanded) {
        this.ApiConfigSection()
      }

      Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

      // ---- 生成区 ----
      ProteusSectionTitle({ title: 'AI 生成整图' })

      Text('输入提示词后一键选型、摆放并连线')
        .fontSize(9)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .width('100%')
        .padding({ left: 8, right: 8, bottom: 4 })

      TextArea({
        placeholder: '例如：STM32F103 最小系统 + LED 闪烁，含示波器观察',
        text: this.promptText
      })
        .height(72)
        .width('100%')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .backgroundColor(ProteusColors.CANVAS_BG)
        .border({ width: 1, color: ProteusColors.INPUT_BORDER })
        .borderRadius(0)
        .padding(6)
        .margin({ left: 8, right: 8 })
        .enabled(!this.aiGenerating)
        .onChange((v: string) => {
          this.promptText = v;
        })

      Row({ space: 6 }) {
        ProteusClassicBtn({
          label: this.aiGenerating ? '取消' : '生成整图',
          widthVal: '46%',
          onAction: () => {
            this.requestGenerate();
          }
        })
        ProteusClassicBtn({
          label: 'AI自检修复',
          widthVal: '28%',
          onAction: () => {
            if (this.aiGenerating) {
              this.statusMessage = '请等待当前任务结束';
              return;
            }
            void this.runSelfCheck();
          }
        })
        ProteusClassicBtn({
          label: '清空',
          widthVal: '20%',
          onAction: () => {
            this.appService.clearAiGenLogs();
          }
        })
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 6, bottom: 4 })

      if (this.aiGenerating) {
        Text(`${this.aiStage.length > 0 ? this.aiStage : 'AI 生成中'} · ${this.aiProgress}%`)
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_LABEL)
          .width('100%')
          .padding({ left: 8, right: 8, bottom: 4 })
      }

      // 首次布局问题 → 询问自检
      if (this.showSelfCheckDialog && !this.aiGenerating) {
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
        .margin({ left: 8, right: 8, bottom: 6 })
        .backgroundColor(ProteusColors.INPUT_READONLY_BG)
        .border({ width: 1, color: ProteusColors.ERC_WARN })
      }

      // 替换 / 追加 选择
      if (this.showModeDialog) {
        Column({ space: 8 }) {
          Text('画布上已有电路时，请选择：')
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
            label: '取消',
            widthVal: '100%',
            onAction: () => {
              this.showModeDialog = false;
            }
          })
        }
        .width('100%')
        .padding(10)
        .margin({ left: 8, right: 8, bottom: 6 })
        .backgroundColor(ProteusColors.INPUT_READONLY_BG)
        .border({ width: 1, color: ProteusColors.SELECTED })
      }

      Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

      // ---- 流式日志 ----
      Row() {
        Text('生成日志')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
          .fontWeight(FontWeight.Medium)
        Blank()
        Text(`${this.logs.length}`)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 6, bottom: 4 })

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
      }
      .layoutWeight(1)
      .width('100%')
      .padding({ left: 6, right: 6, bottom: 6 })
      .scrollBar(BarState.Auto)
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
          onAction: () => { this.showAddForm = !this.showAddForm; }
        })
      }
      .width('100%')
      .padding({ right: 6 })

      if (this.showAddForm) {
        Column({ space: 4 }) {
          Text('选择平台')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width('100%')

          ProteusChipGrid({
            labels: this.providers,
            selectedIdx: this.providerIdx,
            colsPerRow: 3,
            onSelect: (idx: number) => {
              this.providerIdx = idx;
              this.selectedProvider = this.providerTypes[idx];
              const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
              if (tmpl.success && tmpl.data) {
                this.newApiModel = tmpl.data.model;
                this.newApiUrl = tmpl.data.baseUrl;
              }
            }
          })
          .padding({ left: 8, right: 8, top: 2, bottom: 4 })

          Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 2 })

          Row() {
            Text('官网链接')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            TextInput({ placeholder: 'https://example.com （可选）', text: this.newApiUrl })
              .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT).fontSize(ProteusFonts.PARAM_KEY).borderRadius(0)
              .border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .onChange((v: string) => { this.newApiUrl = v; })
          }.width('100%').alignItems(VerticalAlign.Center)

          Row() {
            Text('API Key')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            TextInput({ placeholder: 'sk-...', text: this.newApiKey })
              .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT).fontSize(ProteusFonts.PARAM_KEY).borderRadius(0)
              .border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .type(InputType.Password)
              .onChange((v: string) => { this.newApiKey = v; })
          }.width('100%').alignItems(VerticalAlign.Center)

          Row() {
            Text('API 格式')
              .fontSize(10).fontColor(ProteusColors.TEXT_LABEL).width(52)
            Select(this.buildApiFormatOptions())
              .selected(this.apiFormatIdx)
              .value(this.apiFormats[this.apiFormatIdx].label)
              .font({ size: 10 }).fontColor(ProteusColors.TEXT_PRIMARY)
              .backgroundColor(ProteusColors.CANVAS_BG)
              .layoutWeight(1).height(26)
              .onSelect((idx: number) => {
                this.apiFormatIdx = idx;
                this.newApiFormat = this.apiFormats[idx].value;
              })
          }.width('100%').alignItems(VerticalAlign.Center)

          Row() {
            Text('认证字段')
              .fontSize(10).fontColor(ProteusColors.TEXT_LABEL).width(52)
            TextInput({ placeholder: 'ANTHROPIC_AUTH_TOKEN（默认）', text: this.newAuthField })
              .layoutWeight(1).height(26).fontSize(10).borderRadius(0)
              .border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .onChange((v: string) => { this.newAuthField = v; })
          }.width('100%').alignItems(VerticalAlign.Center)

          Row() {
            Text('模型名称')
              .fontSize(10).fontColor(ProteusColors.TEXT_LABEL).width(52)
            TextInput({ placeholder: 'claude-sonnet-4-6', text: this.newApiModel })
              .layoutWeight(1).height(26).fontSize(10).borderRadius(0)
              .border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .onChange((v: string) => { this.newApiModel = v; })
          }.width('100%').alignItems(VerticalAlign.Center)

          ProteusClassicBtn({
            label: '保存 API',
            widthVal: '100%',
            onAction: () => {
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
                const headers: Record<string, string> = {};
                headers[this.newAuthField] = this.newApiKey;
                config.customHeaders = headers;
              }
              const addResult = this.appService.aiApiManager.addApi(config);
              if (!addResult.success) {
                Logger.error(INSTR_TRACE_TAG,
                  `[AI_API] save FAILED id=${config.id}: ${addResult.error}`);
                this.statusMessage = addResult.error ?? '保存 API 失败';
                return;
              }
              this.appService.syncAiApiConfigsToProject();
              Logger.info(INSTR_TRACE_TAG,
                `[AI_API] saved id=${config.id} name=${config.name}` +
                ` provider=${config.provider} model=${config.model}` +
                ` url=${config.baseUrl} keyLen=${config.apiKey.length}`);
              this.refreshList();
              this.showAddForm = false;
              this.newApiKey = '';
              this.newApiUrl = '';
              this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
              this.statusMessage = `已添加并同步 ${config.name}`;
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
          const modes = [LoadBalanceMode.PRIORITY, LoadBalanceMode.ROUND_ROBIN, LoadBalanceMode.FAILOVER];
          this.appService.aiApiManager.setLoadBalanceStrategy(modes[idx]);
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
        }, (api: AiApiConfig) => api.id)
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
