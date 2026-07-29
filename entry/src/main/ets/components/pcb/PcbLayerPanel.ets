/**
 * KiCad 风格层管理面板 — 色条 + 层名 + 可见性
 */
import { PcbLayerId } from 'common';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../../theme/ThemeManager';
import { ProteusPanelTitle } from '../proteus/ProteusWidgets';
import { ProteusIcon, ProteusIconName } from '../proteus/ProteusIcons';

export interface PcbLayerRow {
  id: PcbLayerId;
  name: string;
  visible: boolean;
  color: string;
}

@Component
export struct PcbLayerPanel {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop layerRows: PcbLayerRow[] = [];
  @Prop activeLayer: PcbLayerId = PcbLayerId.F_CU;
  @Prop panelWidth: number = 200;
  onLayerSelect: (id: PcbLayerId) => void = (_id: PcbLayerId) => {};
  onVisibilityChange: (id: PcbLayerId, visible: boolean) => void = (_id: PcbLayerId, _v: boolean) => {};

  build() {
    Column() {
      ProteusPanelTitle({ title: 'Layers' })
      List() {
        ForEach(this.layerRows, (row: PcbLayerRow) => {
          ListItem() {
            this.layerRow(row)
          }
        }, (row: PcbLayerRow) => row.id)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Auto)
    }
    .width(this.panelWidth)
    .height('100%')
    .backgroundColor(ProteusColors.SIDEBAR_BG)
    .border({ width: { right: 1 }, color: ProteusColors.BORDER })
  }

  @Builder
  layerRow(row: PcbLayerRow) {
    Row() {
      // KiCad 风格左侧色条
      Column()
        .width(4)
        .height(22)
        .backgroundColor(row.color)
        .margin({ left: 4, right: 6 })

      Text(row.name)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(row.id === this.activeLayer
          ? ProteusColors.SELECTED
          : (row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY))
        .fontWeight(row.id === this.activeLayer ? FontWeight.Bold : FontWeight.Normal)
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })

      // 可见性切换
      Column() {
        ProteusIcon({
          name: row.visible ? ProteusIconName.GRID : ProteusIconName.CLOSE,
          iconSize: 12,
          color: row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY
        })
      }
      .width(24)
      .height(22)
      .justifyContent(FlexAlign.Center)
      .onClick(() => {
        this.onVisibilityChange(row.id, !row.visible);
      })
    }
    .width('100%')
    .height(ProteusDimens.TREE_ROW_HEIGHT + 6)
    .padding({ right: 6 })
    .backgroundColor(row.id === this.activeLayer ? ProteusColors.TREE_SELECTED : Color.Transparent)
    .onClick(() => {
      this.onLayerSelect(row.id);
    })
  }
}
