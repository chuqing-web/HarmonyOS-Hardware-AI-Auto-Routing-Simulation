/**
 * 共享 AI API 配置区 — 原理图 AiSettingsPanel / PCB AI 布线面板共用
 * 读写同一 AppService.aiApiManager + 金库，两边配置互通
 */
import { AppService } from '../services/AppService';
import { AiApiConfig, AiProviderType, LoadBalanceMode, Logger, INSTR_TRACE_TAG, Result } from 'common';
import { ProteusClassicBtn, ProteusChipGrid, ProteusTextInput, ProteusSwitch } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';

interface ApiFormatOption {
  label: string;
  value: string;
}

interface SelectValueOption {
  value: string;
}

@Component
export struct AiApiConfigSection {
  @Link statusMessage: string;
  /** 外部递增时刷新列表（例如面板 aboutToAppear） */
  @Prop @Watch('onRefreshTick') refreshTick: number = 0;

  @State apiList: AiApiConfig[] = [];
  @State showAddForm: boolean = false;
  @State newApiName: string = '';
  @State newApiKey: string = '';
  @State newApiModel: string = '';
  @State newApiUrl: string = '';
  @State newApiFormat: string = 'openai';
  @State newAuthField: string = '';
  @State newApiStream: boolean = false;
  @State selectedProvider: AiProviderType = AiProviderType.DEEPSEEK;
  @State apiFormatIdx: number = 2;
  @State editingApiId: string = '';
  @State defaultApiId: string = '';
  @State providerIdx: number = 0;
  @State selectedStratIdx: number = 0;
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
      this.selectedStratIdx = 1;
    }
  }

  private onRefreshTick(): void {
    this.refreshList();
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
    this.newApiStream = false;
    this.newAuthField = this.selectedProvider === AiProviderType.CLAUDE ? 'x-api-key' : '';
  }

  private beginEditApi(api: AiApiConfig): void {
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
    this.newApiStream = src.stream === true;
    this.selectedProvider = src.provider;
    let pIdx = 0;
    for (let i = 0; i < this.providerTypes.length; i++) {
      if (this.providerTypes[i] === src.provider) {
        pIdx = i;
        break;
      }
    }
    this.providerIdx = pIdx;
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
    this.statusMessage = `已选用 ${api.name}（指定默认）`;
  }

  private saveApiFromForm(): void {
    const isEdit = this.editingApiId.length > 0;
    if (isEdit) {
      const keyTrim = this.newApiKey.trim();
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
            name: nameVal, provider: this.selectedProvider, baseUrl: urlVal,
            model: modelVal, apiKey: keyTrim, customHeaders: headers, remark: remarkVal,
            stream: this.newApiStream
          });
        } else {
          upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
            name: nameVal, provider: this.selectedProvider, baseUrl: urlVal,
            model: modelVal, apiKey: keyTrim, remark: remarkVal,
            stream: this.newApiStream
          });
        }
      } else {
        upd = this.appService.aiApiManager.updateApi(this.editingApiId, {
          name: nameVal, provider: this.selectedProvider, baseUrl: urlVal,
          model: modelVal, remark: remarkVal,
          stream: this.newApiStream
        });
      }
      if (!upd.success) {
        this.statusMessage = upd.error ?? '更新 API 失败';
        return;
      }
      const synced = this.appService.syncAiApiConfigsToProject();
      this.refreshList();
      this.showAddForm = false;
      this.resetApiForm();
      this.statusMessage = synced ? '已更新并同步 API 配置' : '已更新到内存，金库保存失败请重试';
      return;
    }

    const tmpl = this.appService.aiApiManager.createFromTemplate(
      this.selectedProvider, this.newApiName || 'New API');
    if (!tmpl.success || !tmpl.data) {
      this.statusMessage = '创建 API 配置失败';
      return;
    }
    const config = tmpl.data;
    config.apiKey = this.newApiKey;
    config.model = (this.newApiModel || config.model).trim();
    config.name = (this.newApiName || config.name || 'New API').trim();
    config.baseUrl = (this.newApiUrl || config.baseUrl).trim();
    config.stream = this.newApiStream;
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
      this.statusMessage = addResult.error ?? '保存 API 失败';
      return;
    }
    const syncedAdd = this.appService.syncAiApiConfigsToProject();
    this.refreshList();
    this.showAddForm = false;
    this.resetApiForm();
    this.statusMessage = syncedAdd
      ? `已添加并同步 ${config.name}`
      : `已添加 ${config.name}，但金库保存失败请重试`;
  }

  private buildApiFormatOptions(): SelectValueOption[] {
    const opts: SelectValueOption[] = [];
    for (let i = 0; i < this.apiFormats.length; i++) {
      opts.push({ value: this.apiFormats[i].label });
    }
    return opts;
  }

  build() {
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
              if (this.editingApiId.length === 0 || providerChanged) {
                const tmpl = this.appService.aiApiManager.createFromTemplate(this.selectedProvider, '');
                if (tmpl.success && tmpl.data) {
                  this.newApiModel = tmpl.data.model;
                  this.newApiUrl = tmpl.data.baseUrl;
                }
              }
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
            }).layoutWeight(1)
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
            }).layoutWeight(1)
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
            }).layoutWeight(1)
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          Row() {
            Text('模型名称')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            ProteusTextInput({
              placeholder: 'claude-sonnet-4-6',
              text: this.newApiModel,
              onChange: (v: string) => { this.newApiModel = v; }
            }).layoutWeight(1)
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          Row() {
            Text('流式回复（SSE）')
              .fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            Text('长生成持续回包，绕开网关/代理响应上限')
              .fontSize(9).fontColor(ProteusColors.TEXT_SECONDARY)
              .layoutWeight(1)
            ProteusSwitch({
              isOn: this.newApiStream,
              onChange: (on: boolean) => { this.newApiStream = on; }
            })
          }.width('100%').alignItems(VerticalAlign.Center).margin({ bottom: 4 })

          ProteusClassicBtn({
            label: this.editingApiId.length > 0 ? '更新 API' : '保存 API',
            widthVal: '100%',
            onAction: () => { this.saveApiFromForm(); }
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
                  .fontSize(8).fontColor(ProteusColors.ERC_OK).margin({ left: 4, right: 4 })
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
                onAction: () => { this.selectAsDefault(api); }
              })
              ProteusClassicBtn({
                label: '编辑', widthVal: 44,
                onAction: () => { this.beginEditApi(api); }
              })
              ProteusClassicBtn({
                label: '测试', widthVal: 44,
                onAction: async () => {
                  this.statusMessage = `测试 ${api.name}...`;
                  const result = await this.appService.aiApiManager.testConnection(api.id);
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
}
