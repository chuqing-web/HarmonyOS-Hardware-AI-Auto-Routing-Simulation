/**
 * 运行日志面板 — 专显 instr_trace，可选中复制
 */
import { pasteboard } from '@kit.BasicServicesKit';
import { Logger } from 'common';
import { ProteusClassicBtn, ProteusSectionTitle } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';

@Component
export struct InstrTraceLogPanel {
  @Link statusMessage: string;
  @State logText: string = '';
  @State lineCount: number = 0;

  private refreshTimer: number = -1;
  private lastSeq: number = -1;

  aboutToAppear(): void {
    this.pullLog(true);
    this.refreshTimer = setInterval(() => {
      this.pullLog(false);
    }, 400);
  }

  aboutToDisappear(): void {
    if (this.refreshTimer >= 0) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = -1;
    }
  }

  private pullLog(force: boolean): void {
    const seq = Logger.getInstrTraceSeq();
    if (!force && seq === this.lastSeq) {
      return;
    }
    this.lastSeq = seq;
    this.lineCount = Logger.getInstrTraceLineCount();
    this.logText = Logger.getInstrTraceText();
  }

  private async copyAll(): Promise<void> {
    const text = this.logText.length > 0 ? this.logText : Logger.getInstrTraceText();
    if (text.length === 0) {
      this.statusMessage = '运行日志为空';
      return;
    }
    try {
      const data = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text);
      await pasteboard.getSystemPasteboard().setData(data);
      this.statusMessage = `已复制 instr_trace ${this.lineCount} 行`;
    } catch (_e) {
      this.statusMessage = '复制失败';
    }
  }

  private clearLog(): void {
    Logger.clearInstrTrace();
    this.pullLog(true);
    this.statusMessage = '已清空运行日志';
  }

  build() {
    Column({ space: 4 }) {
      ProteusSectionTitle({ title: '运行日志 (instr_trace)' })

      Row({ space: 4 }) {
        Text(`${this.lineCount} 行`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .layoutWeight(1)
          .textAlign(TextAlign.Start)
        ProteusClassicBtn({
          label: '复制全部',
          widthVal: 72,
          onAction: () => { void this.copyAll(); }
        })
        ProteusClassicBtn({
          label: '清空',
          widthVal: 56,
          onAction: () => this.clearLog()
        })
      }
      .width('100%')
      .padding({ left: 6, right: 6 })

      Text('可拖选文本后 Ctrl+C / 长按复制；或点「复制全部」')
        .fontSize(9)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 8, right: 8, bottom: 2 })
        .alignSelf(ItemAlign.Start)

      TextArea({ text: this.logText.length > 0 ? this.logText : '(暂无 instr_trace 日志)' })
        .width('100%')
        .layoutWeight(1)
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .backgroundColor(ProteusColors.INPUT_READONLY_BG)
        .caretColor(ProteusColors.TEXT_PRIMARY)
        .copyOption(CopyOptions.LocalDevice)
        .enableKeyboardOnFocus(false)
        .padding(6)
        .margin({ left: 4, right: 4, bottom: 4 })
        .border({ width: 1, color: ProteusColors.DIVIDER })
    }
    .width('100%')
    .height('100%')
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(ProteusColors.CANVAS_BG)
  }
}
