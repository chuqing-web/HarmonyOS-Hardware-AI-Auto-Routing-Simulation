import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';

@Component
export struct AppStatusBar {
  @Prop statusMessage: string = '';
  @Prop toolModeLabel: string = '';
  @Prop mouseX: number = 0;
  @Prop mouseY: number = 0;
  @Prop gridSize: number = 10;
  @Prop selectedCount: number = 0;
  @Prop ercCount: number = 0;
  @Prop simRunning: boolean = false;
  @Prop simPaused: boolean = false;
  @Prop aiProgress: number = 0;
  @Prop aiStage: string = '';
  @Prop zoomPercent: number = 100;

  build() {
    Row() {
      Text(this.statusMessage)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_LABEL)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width(160)
      Text(`[${this.toolModeLabel}]`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .margin({ left: 4, right: 12 })
      Text(`X:${this.mouseX} Y:${this.mouseY}`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 12 })
      Text(`网格: ${this.gridSize} mil`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 12 })
      Text(`选中: ${this.selectedCount}`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 12 })
      if (this.ercCount === 0) {
        Text('✓ ERC')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.ERC_OK)
          .margin({ right: 12 })
      } else {
        Text(`⚠ ERC: ${this.ercCount}`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.ERC_WARN)
          .margin({ right: 12 })
      }
      Text(this.simRunning ? (this.simPaused ? '仿真: 暂停' : '仿真: 运行') : '仿真: 空闲')
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 12 })
      Blank()
      if (this.aiProgress > 0 && this.aiProgress < 100) {
        Text(`${this.aiStage} ${this.aiProgress}%`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_LABEL)
          .margin({ right: 12 })
      }
      Text(`${this.zoomPercent}%`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 8 })
    }
    .width('100%')
    .height(ProteusDimens.STATUS_HEIGHT)
    .padding({ left: 8, right: 8 })
    .backgroundColor(ProteusColors.STATUS_BAR_BG)
    .border({ width: { top: 1 }, color: ProteusColors.DIVIDER })
    .alignItems(VerticalAlign.Center)
  }
}
