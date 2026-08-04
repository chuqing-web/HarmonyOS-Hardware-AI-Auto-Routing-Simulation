/**
 * PCB AI route panel — style matches schematic AiSettingsPanel.
 * API config shared via AiApiConfigSection / same vault.
 */
import { AppService, AiGenLogEntry } from '../../services/AppService';
import { AiApiConfig, Logger, INSTR_TRACE_TAG, ProgressInfo } from 'common';
import { AiApiConfigSection } from '../AiApiConfigSection';
import { ProteusClassicBtn } from '../proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../../theme/ProteusTheme';

@Component
export struct PcbAiRoutePanel {
  @Link statusMessage: string;
  @Link aiBusy: boolean;
  @Link aiProgress: number;
  @Link aiStage: string;
  onRouteDone: () => void = () => {};

  @State apiSectionExpanded: boolean = false;
  @State apiRefreshTick: number = 0;
  @State logs: AiGenLogEntry[] = [];
  @State private logSeq: number = 0;

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    this.apiRefreshTick++;
    this.appendLog('system', 'PCB AI route: place -> net -> layer -> geometry -> QA (shared API vault)');
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

  private async runAiRoute(): Promise<void> {
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
    this.aiBusy = true;
    this.aiProgress = 0;
    this.aiStage = 'placement';
    this.appendLog('user', 'Start PCB AI route');
    this.appendLog('system', '开始 PCB AI 布线 · 画布已锁定（place→net→layer→geometry→QA）');
    this.appendLog('assistant', '正在准备布局与布线…');
    Logger.info(INSTR_TRACE_TAG, '[AI_PCB_UI] run start');

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

  build() {
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
          ? `${this.aiStage} · 画布已锁定`
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
        ProteusClassicBtn({
          label: this.aiBusy ? '布线中…' : '开始 AI 布线',
          widthVal: '100%',
          onAction: () => { void this.runAiRoute(); }
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
  }
}
