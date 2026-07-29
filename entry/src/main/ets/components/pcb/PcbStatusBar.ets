/**
 * KiCad 风格状态栏 — 坐标 / 网格 / 缩放 / 活动层
 */
import { PcbLayerId } from 'common';
import { appVersionLabel } from 'common';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../../theme/ThemeManager';

@Component
export struct PcbStatusBar {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop statusMessage: string = '';
  @Prop worldX: number = 0;
  @Prop worldY: number = 0;
  @Prop zoomPercent: number = 100;
  @Prop activeLayer: PcbLayerId = PcbLayerId.F_CU;
  @Prop gridSize: number = 5;
  @Prop gridVisible: boolean = true;

  build() {
    Row() {
      // 状态消息
      Text(this.statusMessage)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .layoutWeight(2)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ left: 8 })

      // 分隔
      this.sep()

      // 坐标
      Text(`X ${this.worldX.toFixed(1)}  Y ${this.worldY.toFixed(1)} mil`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontFamily('monospace')

      this.sep()

      // 网格
      Text(this.gridVisible ? `Grid ${this.gridSize} mil` : 'Grid off')
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_SECONDARY)

      this.sep()

      // 活动层
      Text(this.activeLayer)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.SELECTED)
        .fontWeight(FontWeight.Medium)

      Blank()

      // 缩放
      Text(`${this.zoomPercent}%`)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Medium)
        .margin({ right: 12 })

      Text(appVersionLabel())
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .margin({ right: 8 })
    }
    .width('100%')
    .height(ProteusDimens.STATUS_HEIGHT)
    .backgroundColor(ProteusColors.STATUS_BAR_BG)
    .border({ width: { top: 1 }, color: ProteusColors.BORDER })
    .alignItems(VerticalAlign.Center)
  }

  @Builder
  sep() {
    Text('|')
      .fontSize(ProteusFonts.STATUS)
      .fontColor(ProteusColors.DIVIDER)
      .margin({ left: 8, right: 8 })
  }
}
