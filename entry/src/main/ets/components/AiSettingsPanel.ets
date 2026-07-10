/**
 * AI API 管理面板
 */
import { AppService } from '../services/AppService';
import { AiApiConfig, AiProviderType, LoadBalanceMode } from 'common';
import { ProteusClassicBtn, ProteusChipGrid } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';

interface ApiFormatOption {
  label: string;
  value: string;
}

@Component
export struct AiSettingsPanel {
  @Link statusMessage: string;
  @State apiList: AiApiConfig[] = [];
  @State showAddForm: boolean = false;
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
  private authFieldOptions: string[] = [
    'ANTHROPIC_AUTH_TOKEN', 'x-api-key', 'Authorization', 'Bearer', 'X-API-Key'
  ];

  aboutToAppear(): void {
    this.refreshList();
  }

  refreshList(): void {
    this.apiList = this.appService.aiApiManager.listApis();
  }

  build() {
    Column() {
      Row() {
        Text('AI API 管理')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)
          .padding({ left: 8, top: 8, bottom: 4 })
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
          // Provider chips
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

          // Endpoint URL
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

          // API Key
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

          // API Format
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

          Text('选择供应商 API 的输入格式')
            .fontSize(8).fontColor(ProteusColors.TEXT_SECONDARY)
            .width('100%').padding({ left: 56 })

          // Auth field
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

          // Model name
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
              if (!tmpl.success || !tmpl.data) return;
              const config = tmpl.data;
              config.apiKey = this.newApiKey;
              config.model = this.newApiModel || config.model;
              config.name = this.newApiName || config.name;
              config.baseUrl = this.newApiUrl || config.baseUrl;
              if (this.newAuthField.length > 0) {
                const headers: Record<string, string> = {};
                headers[this.newAuthField] = this.newApiKey;
                config.customHeaders = headers;
              }
              this.appService.aiApiManager.addApi(config);
              this.refreshList();
              this.showAddForm = false;
              this.newApiKey = '';
              this.newApiUrl = '';
              this.newAuthField = 'ANTHROPIC_AUTH_TOKEN';
              this.statusMessage = `已添加 ${config.name}`;
            }
          })
        }
        .padding({ left: 6, right: 6, top: 4, bottom: 4 })
        .backgroundColor(ProteusColors.INPUT_READONLY_BG)
        .border({ width: 1, color: ProteusColors.DIVIDER })
        .margin({ left: 4, right: 4, top: 2 })
      }

      // Load balance
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

      Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

      // Configured APIs list
      Row() {
        Text('已配置 API')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
        Blank()
        Text(`${this.apiList.length} 个`)
          .fontSize(9).fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .width('100%').padding({ left: 6, right: 6, top: 4 })

      List({ space: 2 }) {
        ForEach(this.apiList, (api: AiApiConfig) => {
          ListItem() {
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
                    const result = await this.appService.aiApiManager.testConnection(api.id);
                    this.statusMessage = result.success ? `${api.name} 连接成功` : `${api.name} 失败`;
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
                    this.refreshList();
                  }
                })
                ProteusClassicBtn({
                  label: '删', widthVal: 36,
                  onAction: () => {
                    this.appService.aiApiManager.removeApi(api.id);
                    this.refreshList();
                  }
                })
              }.width('100%')
            }
            .width('100%')
            .padding({ left: 6, right: 6, top: 4, bottom: 4 })
            .backgroundColor(ProteusColors.INPUT_READONLY_BG)
            .border({ width: 1, color: ProteusColors.DIVIDER })
          }
        }, (api: AiApiConfig) => api.id)
      }
      .layoutWeight(1).width('100%').padding({ left: 4, right: 4, top: 2 })

      Row({ space: 4 }) {
        ProteusClassicBtn({
          label: '导入', widthVal: '30%',
          onAction: () => { this.statusMessage = '请将 JSON 配置文件放入应用目录后导入'; }
        })
        ProteusClassicBtn({
          label: '导出', widthVal: '30%',
          onAction: () => {
            const result = this.appService.aiApiManager.exportConfigs(true);
            this.statusMessage = result.success ? '配置已导出' : '导出失败';
          }
        })
        ProteusClassicBtn({
          label: '清空', widthVal: '30%',
          onAction: () => {
            this.appService.aiApiManager.clearAllConfigs();
            this.refreshList();
            this.statusMessage = '已清空所有 AI 配置';
          }
        })
      }
      .width('100%').padding({ left: 4, right: 4, top: 4, bottom: 4 })
    }
    .width('100%').height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
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
