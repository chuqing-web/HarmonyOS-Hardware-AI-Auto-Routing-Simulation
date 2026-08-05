/**
 * PCB AI route panel — style matches schematic AiSettingsPanel（含推理开关）。
 * API config shared via AiApiConfigSection / same vault / aiEnableReasoning.
 * 开始前弹窗确认布线铜层数（2/4/6/8）；QA 仍可 raiseCopper。
 */
import { AppService, AiGenLogEntry } from '../../services/AppService';
import { AiApiConfig, Logger, INSTR_TRACE_TAG, ProgressInfo } from 'common';
import { AiApiConfigSection } from '../AiApiConfigSection';
import { ProteusClassicBtn, ProteusChipGrid } from '../proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../../theme/ProteusTheme';

const COPPER_OPTIONS: number[] = [2, 4, 6, 8];
const COPPER_LABELS: string[] = ['2', '4', '6', '8'];

@Component
export struct PcbAiRoutePanel {
  @Link statusMessage: string;
  @Link aiBusy: boolean;
  @Link aiProgress: number;
  @Link aiStage: string;
  onRouteDone: () => void = () => {};
  /** 确认层数时同步层栈 UI（与层栈 Tab 的 onSetCopperCount 同源） */
  onSetCopperCount: (n: number) => void = (_n: number) => {};

  @State apiSectionExpanded: boolean = false;
  @State apiRefreshTick: number = 0;
  @State logs: AiGenLogEntry[] = [];
  @State private logSeq: number = 0;
  /** 与原理图 AiSettingsPanel 共用 AppService.aiEnableReasoning */
  @State enableReasoning: boolean = false;
  @State private showLayerConfirm: boolean = false;
  /** 弹窗内当前板铜层（展示用） */
  @State private boardCopperCount: number = 2;
  /** 弹窗内用户选择的目标铜层 */
  @State private confirmCopperCount: number = 2;

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    this.apiRefreshTick++;
    this.enableReasoning = this.appService.aiEnableReasoning;
    this.appendLog('system',
      'PCB AI route: place → net → layer → geometry → QA（与原理图共用 API / 推理开关）');
  }

  private appendLog(role: 'user' | 'assistant' | 'system', text: string): void {
    this.logSeq++;
    const entry: AiGenLogEntry = {
      id: `pcbai_${this.logSeq}_${Date.now()}`,
      role: role,
      text: text,
      ts: Date.now()
    };
    const next: AiGenLogEntry[] = this.logs.slice();
    next.push(entry);
    if (next.length > 80) {
      this.logs = next.slice(next.length - 80);
    } else {
      this.logs = next;
    }
  }

  /** 对齐原理图 handleAiGenProgress：阶段进度写入气泡，同阶段只更新百分比 */
  private appendProgressLog(p: ProgressInfo): void {
    if (p.stage.length === 0) {
      return;
    }
    const s = p.stage.trim();
    if (s === 'init' || s === 'done' || s.indexOf('Starting task') >= 0 || s.indexOf('Task complete') >= 0) {
      return;
    }
    const line = `[${p.progress}%] ${s}`;
    if (this.logs.length > 0) {
      const last = this.logs[this.logs.length - 1];
      if (last.role === 'assistant' && last.text.indexOf(`] ${s}`) >= 0) {
        const updated: AiGenLogEntry = {
          id: last.id,
          role: last.role,
          text: line,
          ts: Date.now()
        };
        const next = this.logs.slice(0, this.logs.length - 1);
        next.push(updated);
        this.logs = next;
        return;
      }
    }
    this.appendLog('assistant', line);
  }

  private bubbleBg(role: string): string {
    if (role === 'user') {
      return '#2B6CB0';
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

  private toggleReasoning(): void {
    this.enableReasoning = !this.enableReasoning;
    this.appService.aiEnableReasoning = this.enableReasoning;
    Logger.info(INSTR_TRACE_TAG, `[AI_PCB_UI] enableReasoning=${this.enableReasoning}`);
    this.statusMessage = this.enableReasoning
      ? '已开启推理：布局/网络/层角色/几何/QA 允许 thinking，并隔离 JSON（较慢）'
      : '已关闭推理（默认，利于纯 JSON）';
    this.appendLog('system', this.enableReasoning
      ? '推理开 · 深度思考模式（与原理图 AI 共用）'
      : '推理关 · 纯 JSON 模式');
  }

  private normalizeCopperChoice(n: number): number {
    if (n === 4 || n === 6 || n === 8) {
      return n;
    }
    return 2;
  }

  private copperSelectedIdx(): number {
    for (let i = 0; i < COPPER_OPTIONS.length; i++) {
      if (COPPER_OPTIONS[i] === this.confirmCopperCount) {
        return i;
      }
    }
    return 0;
  }

  /** 点「开始」：先弹层数确认；busy 时走取消 */
  private onStartClicked(): void {
    if (this.aiBusy) {
      void this.runAiRoute();
      return;
    }
    this.openLayerConfirm();
  }

  private openLayerConfirm(): void {
    const cur = this.appService.pcbEditor.getLayerStackCopperCount();
    this.boardCopperCount = cur;
    this.confirmCopperCount = this.normalizeCopperChoice(cur);
    this.showLayerConfirm = true;
    this.appendLog('system', `确认布线铜层（当前 ${cur}）…`);
  }

  private cancelLayerConfirm(): void {
    this.showLayerConfirm = false;
    this.appendLog('system', '已取消：未启动 AI 布线');
    this.statusMessage = '已取消 AI 布线';
  }

  private confirmLayerAndStart(): void {
    const target = this.normalizeCopperChoice(this.confirmCopperCount);
    const prev = this.boardCopperCount;
    this.showLayerConfirm = false;
    if (target !== prev) {
      this.onSetCopperCount(target);
      this.appendLog('system', `铜层确认：${prev}→${target}`);
      Logger.info(INSTR_TRACE_TAG, `[AI_PCB_UI] copper confirm ${prev}→${target}`);
    } else {
      this.appendLog('system', `铜层确认：保持 ${target} 层`);
      Logger.info(INSTR_TRACE_TAG, `[AI_PCB_UI] copper confirm keep ${target}`);
    }
    this.statusMessage = `AI 布线铜层：${target}`;
    void this.runAiRoute(target);
  }

  private async runAiRoute(confirmedCopper?: number): Promise<void> {
    if (this.aiBusy) {
      this.appService.cancelAiGenerate();
      this.appendLog('system', 'cancel requested');
      return;
    }
    const apis: AiApiConfig[] = this.appService.aiApiManager.listApis();
    if (apis.length === 0) {
      this.statusMessage = 'Please configure AI API first';
      this.apiSectionExpanded = true;
      this.appendLog('system', 'No API config — expand API section');
      return;
    }
    this.enableReasoning = this.appService.aiEnableReasoning;
    const cu = confirmedCopper !== undefined
      ? confirmedCopper
      : this.appService.pcbEditor.getLayerStackCopperCount();
    this.aiBusy = true;
    this.aiProgress = 0;
    this.aiStage = 'placement';
    this.appendLog('user',
      `Start PCB AI route · Cu=${cu} · ${this.enableReasoning ? '推理开' : '推理关'}`);
    this.appendLog('system',
      `开始 PCB AI 布线 · Cu=${cu} · 画布已锁定（place→net→layer→geometry→QA）` +
      ` · ${this.enableReasoning ? '深度思考' : '无 thinking'} · QA 仍可自动加层`);
    this.appendLog('assistant', '正在准备布局与布线…');
    Logger.info(INSTR_TRACE_TAG,
      `[AI_PCB_UI] run start Cu=${cu} reasoning=${this.enableReasoning}`);

    const prevProgress: (p: ProgressInfo) => void = this.appService.onAiProgress;
    this.appService.onAiProgress = (p: ProgressInfo): void => {
      this.aiProgress = p.progress;
      this.aiStage = p.stage;
      this.appendProgressLog(p);
      prevProgress(p);
    };

    try {
      const ok: boolean = await this.appService.aiPcbAutoRoute();
      const detail = this.statusMessage.trim();
      if (ok) {
        this.appendLog('assistant',
          detail.length > 0 ? detail : 'Done: placement + multilayer tracks/vias applied');
        this.appendLog('system', '画布已解锁 · 板铜已写回');
        if (detail.length === 0) {
          this.statusMessage = 'PCB AI route done';
        }
        this.onRouteDone();
      } else {
        this.appendLog('system',
          detail.length > 0
            ? `Failed: ${detail}（board unchanged）`
            : 'Failed: board unchanged (see [AI_PCB] logs)');
        this.appendLog('system', '画布已解锁 · 板未改动');
        if (detail.length === 0) {
          this.statusMessage = 'PCB AI route failed (board unchanged)';
        }
      }
    } finally {
      this.appService.onAiProgress = prevProgress;
      this.aiBusy = this.appService.isAiGenerating();
      if (!this.aiBusy) {
        this.aiProgress = 100;
        this.aiStage = '';
      }
      this.apiRefreshTick++;
    }
  }

  @Builder
  private layerConfirmDialog() {
    Column() {
      Column({ space: 10 }) {
        Text('确认布线铜层数')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .width('100%')

        Text(`当前板：${this.boardCopperCount} 层铜`)
          .fontSize(11)
          .fontColor(ProteusColors.SELECTED)
          .width('100%')

        Text('请选择本次 AI 布线使用的铜层数：')
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .width('100%')

        ProteusChipGrid({
          labels: COPPER_LABELS,
          selectedIdx: this.copperSelectedIdx(),
          colsPerRow: 4,
          onSelect: (idx: number) => {
            if (idx >= 0 && idx < COPPER_OPTIONS.length) {
              this.confirmCopperCount = COPPER_OPTIONS[idx];
            }
          }
        })

        Text('失败时 QA 仍可能自动加层（如 2→4）。')
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .width('100%')

        Row({ space: 8 }) {
          ProteusClassicBtn({
            label: '取消',
            widthVal: '48%',
            onAction: () => { this.cancelLayerConfirm(); }
          })
          ProteusClassicBtn({
            label: '确认并开始',
            widthVal: '48%',
            onAction: () => { this.confirmLayerAndStart(); }
          })
        }
        .width('100%')
        .justifyContent(FlexAlign.SpaceBetween)
      }
      .width('88%')
      .padding({ left: 14, right: 14, top: 14, bottom: 14 })
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 8, color: '#44000000', offsetX: 0, offsetY: 2 })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor('#99000000')
    .hitTestBehavior(HitTestMode.Default)
    .onClick(() => {
      // 点击遮罩不关闭，避免误触；仅按钮可取消
    })
  }

  build() {
    Stack() {
      Column() {
        Row() {
          Text('AI 布线')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .fontWeight(FontWeight.Medium)
            .layoutWeight(1)
          if (this.aiBusy) {
            Text(`${this.aiProgress}%`)
              .fontSize(10)
              .fontColor(ProteusColors.TEXT_LABEL)
              .margin({ right: 8 })
          }
          Text(this.apiSectionExpanded ? 'API' : 'API')
            .fontSize(10)
            .fontColor(ProteusColors.TEXT_LABEL)
            .padding({ left: 6, right: 6, top: 4, bottom: 4 })
            .onClick(() => {
              this.apiSectionExpanded = !this.apiSectionExpanded;
              if (this.apiSectionExpanded) {
                this.apiRefreshTick++;
              }
            })
          if (this.aiBusy) {
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

        if (this.aiBusy) {
          Text(this.aiStage.length > 0
            ? `${this.aiStage} · 画布已锁定` +
              (this.enableReasoning ? ' · 深度思考中' : '')
            : '画布已锁定，禁止手动编辑')
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
        .padding({ left: 8, right: 8, top: 4, bottom: 4 })

        Column({ space: 6 }) {
          Text('当前 PCB：AI 布局封装后多层布线与过孔。失败不改板。')
            .fontSize(9)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .width('100%')

          Row() {
            Text(this.enableReasoning ? '● 推理开' : '○ 推理关')
              .fontSize(10)
              .fontColor(this.enableReasoning ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY)
              .padding({ left: 4, right: 8, top: 4, bottom: 4 })
              .enabled(!this.aiBusy)
              .onClick(() => {
                if (!this.aiBusy) {
                  this.toggleReasoning();
                }
              })
            Text('严格质量 · 禁残留交付')
              .fontSize(9)
              .fontColor(ProteusColors.ERC_OK)
              .padding({ right: 8 })
            Text(this.enableReasoning ? '深度思考中（较慢）' : '难板可开推理')
              .fontSize(9)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .layoutWeight(1)
          }
          .width('100%')

          ProteusClassicBtn({
            label: this.aiBusy ? '布线中…' : '开始 AI 布线',
            widthVal: '100%',
            onAction: () => { this.onStartClicked(); }
          })
          ProteusClassicBtn({
            label: '清空日志',
            widthVal: '100%',
            onAction: () => {
              this.logs = [];
              this.appendLog('system', '日志已清空');
            }
          })
        }
        .width('100%')
        .padding({ left: 8, right: 8, top: 6, bottom: 10 })
        .border({ width: { top: 1 }, color: ProteusColors.DIVIDER })
      }
      .width('100%')
      .height('100%')
      .backgroundColor(ProteusColors.CANVAS_BG)

      if (this.showLayerConfirm) {
        this.layerConfirmDialog()
      }
    }
    .width('100%')
    .height('100%')
  }
}
