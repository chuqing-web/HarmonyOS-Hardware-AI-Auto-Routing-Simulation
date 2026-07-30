/**
 * KiCad 风格层管理面板 — 显隐 / 透明度 / 单层预览预设
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
  opacity: number;
}

@Component
export struct PcbLayerPanel {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop layerRows: PcbLayerRow[] = [];
  @Prop activeLayer: PcbLayerId = PcbLayerId.F_CU;
  @Prop panelWidth: number = 200;
  onLayerSelect: (id: PcbLayerId) => void = (_id: PcbLayerId) => {};
  onVisibilityChange: (id: PcbLayerId, visible: boolean) => void = (_id: PcbLayerId, _v: boolean) => {};
  onOpacityChange: (id: PcbLayerId, opacity: number) => void = (_id: PcbLayerId, _o: number) => {};
  onPreset: (preset: string) => void = (_p: string) => {};

  build() {
    Column() {
      ProteusPanelTitle({ title: 'Layers' })

      Row({ space: 3 }) {
        this.presetChip('顶层', 'top')
        this.presetChip('底层', 'bottom')
        this.presetChip('单层', 'solo')
        this.presetChip('全部', 'all')
      }
      .width('100%')
      .padding({ left: 6, right: 6, bottom: 4 })

      List() {
        ForEach(this.layerRows, (row: PcbLayerRow) => {
          ListItem() {
            this.layerRow(row)
          }
        }, (row: PcbLayerRow) => `${row.id}:${row.visible}:${row.opacity}`)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Auto)
    }
    .width(this.panelWidth)
    .height('100%')
    .backgroundColor(ProteusColors.SIDEBAR_BG)
    .border({ width: { right: 1 }, color: ProteusColors.BORDER })
    .hitTestBehavior(HitTestMode.Default)
  }

  @Builder
  presetChip(label: string, preset: string) {
    Button({ type: ButtonType.Normal }) {
      Text(label)
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_PRIMARY)
    }
    .height(22)
    .padding({ left: 6, right: 6 })
    .backgroundColor(ProteusColors.BTN_BG)
    .border({ width: 1, color: ProteusColors.BORDER })
    .borderRadius(2)
    .stateEffect(false)
    .onClick(() => { this.onPreset(preset); })
  }

  @Builder
  opacityChip(label: string, id: PcbLayerId, opacity: number) {
    Button({ type: ButtonType.Normal }) {
      Text(label)
        .fontSize(9)
        .fontColor(ProteusColors.TEXT_SECONDARY)
    }
    .height(18)
    .padding({ left: 4, right: 4 })
    .backgroundColor(Color.Transparent)
    .border({ width: 1, color: ProteusColors.BORDER })
    .borderRadius(2)
    .stateEffect(false)
    .onClick(() => { this.onOpacityChange(id, opacity); })
  }

  @Builder
  layerRow(row: PcbLayerRow) {
    Column() {
      Row() {
        Column()
          .width(4)
          .height(22)
          .backgroundColor(row.color)
          .margin({ left: 4, right: 6 })

        Button({ type: ButtonType.Normal }) {
          Text(row.name)
            .fontSize(ProteusFonts.STATUS)
            .fontColor(row.id === this.activeLayer
              ? ProteusColors.SELECTED
              : (row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY))
            .fontWeight(row.id === this.activeLayer ? FontWeight.Bold : FontWeight.Normal)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .width('100%')
            .textAlign(TextAlign.Start)
        }
        .layoutWeight(1)
        .height(ProteusDimens.TREE_ROW_HEIGHT + 4)
        .padding({ left: 2, right: 2 })
        .backgroundColor(Color.Transparent)
        .border({ width: 0 })
        .stateEffect(false)
        .onClick(() => { this.onLayerSelect(row.id); })

        Button({ type: ButtonType.Normal }) {
          ProteusIcon({
            name: row.visible ? ProteusIconName.GRID : ProteusIconName.CLOSE,
            iconSize: 12,
            color: row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY
          })
        }
        .width(28)
        .height(26)
        .padding(0)
        .backgroundColor(Color.Transparent)
        .border({ width: 0 })
        .stateEffect(false)
        .onClick(() => { this.onVisibilityChange(row.id, !row.visible); })
      }
      .width('100%')
      .height(ProteusDimens.TREE_ROW_HEIGHT + 4)

      // 铜层透明度快捷调节
      if (row.id === PcbLayerId.F_CU || row.id === PcbLayerId.B_CU ||
        row.id === PcbLayerId.IN1_CU || row.id === PcbLayerId.IN2_CU) {
        Row({ space: 2 }) {
          this.opacityChip('30%', row.id, 0.3)
          this.opacityChip('60%', row.id, 0.6)
          this.opacityChip('100%', row.id, 1.0)
          Text(`${Math.round(row.opacity * 100)}%`)
            .fontSize(9)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .margin({ left: 4 })
        }
        .width('100%')
        .padding({ left: 14, right: 6, bottom: 2 })
      }
    }
    .width('100%')
    .padding({ right: 4 })
    .backgroundColor(row.id === this.activeLayer ? ProteusColors.TREE_SELECTED : Color.Transparent)
  }
}
