/**
 * KiCad 风格右侧面板 — 属性 / DRC / 活动层 标签页
 */
import { PcbDrcViolation, PcbDrcSeverity, PcbLayerId } from 'common';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../../theme/ThemeManager';
import { ProteusClassicBtn, ProteusChipTab, ProteusPanelTitle } from '../proteus/ProteusWidgets';

enum PcbRightTab {
  PROPERTIES = 0,
  DRC = 1,
  LAYER = 2
}

@Component
export struct PcbRightPanel {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop panelWidth: number = 260;
  @Prop selectionInfo: string = '';
  @Prop selectedZoneId: string = '';
  @Prop activeLayer: PcbLayerId = PcbLayerId.F_CU;
  @Prop drcViolations: PcbDrcViolation[] = [];
  onZonePriority: (delta: number) => void = (_d: number) => {};
  onZoneThermal: () => void = () => {};
  onZoneRefreshCutouts: () => void = () => {};

  @State private activeTab: PcbRightTab = PcbRightTab.PROPERTIES;

  build() {
    Column() {
      Row({ space: 2 }) {
        ProteusChipTab({
          label: '属性',
          selected: this.activeTab === PcbRightTab.PROPERTIES,
          fillWidth: true,
          onSelect: () => { this.activeTab = PcbRightTab.PROPERTIES; }
        })
        ProteusChipTab({
          label: 'DRC',
          selected: this.activeTab === PcbRightTab.DRC,
          fillWidth: true,
          onSelect: () => { this.activeTab = PcbRightTab.DRC; }
        })
        ProteusChipTab({
          label: '层',
          selected: this.activeTab === PcbRightTab.LAYER,
          fillWidth: true,
          onSelect: () => { this.activeTab = PcbRightTab.LAYER; }
        })
      }
      .width('100%')
      .padding({ left: 4, right: 4, top: 4, bottom: 4 })
      .backgroundColor(ProteusColors.PANEL_TITLE_BG)

      if (this.activeTab === PcbRightTab.PROPERTIES) {
        this.buildPropertiesTab()
      } else if (this.activeTab === PcbRightTab.DRC) {
        this.buildDrcTab()
      } else {
        this.buildLayerTab()
      }
    }
    .width(this.panelWidth)
    .height('100%')
    .backgroundColor(ProteusColors.SIDEBAR_BG)
    .border({ width: { left: 1 }, color: ProteusColors.BORDER })
  }

  @Builder
  buildPropertiesTab() {
    Column() {
      ProteusPanelTitle({ title: 'Selection' })
      if (this.selectionInfo.length > 0) {
        Text(this.selectionInfo)
          .fontSize(ProteusFonts.PARAM_VALUE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .padding({ left: 10, right: 10, top: 8, bottom: 8 })
          .width('100%')
      } else {
        Column() {
          Text('未选中对象')
            .fontSize(ProteusFonts.STATUS)
            .fontColor(ProteusColors.TEXT_SECONDARY)
          Text('点击封装、走线或过孔查看属性')
            .fontSize(10)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .margin({ top: 4 })
        }
        .padding(12)
        .alignItems(HorizontalAlign.Start)
      }

      if (this.selectedZoneId.length > 0) {
        ProteusPanelTitle({ title: '覆铜编辑' })
        Row({ space: 4 }) {
          ProteusClassicBtn({
            label: '优先级-',
            widthVal: 72,
            onAction: () => { this.onZonePriority(-1); }
          })
          ProteusClassicBtn({
            label: '优先级+',
            widthVal: 72,
            onAction: () => { this.onZonePriority(1); }
          })
        }
        .padding({ left: 8, right: 8, bottom: 4 })
        Row({ space: 4 }) {
          ProteusClassicBtn({
            label: '热焊盘',
            widthVal: 72,
            onAction: () => { this.onZoneThermal(); }
          })
          ProteusClassicBtn({
            label: '刷新挖空',
            widthVal: 72,
            onAction: () => { this.onZoneRefreshCutouts(); }
          })
        }
        .padding({ left: 8, right: 8, bottom: 8 })
        Text('覆铜工具下再次点击可手动挖空')
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .padding({ left: 10, right: 10, bottom: 8 })
      }
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  buildDrcTab() {
    Column() {
      ProteusPanelTitle({ title: 'Design Rules Check' })
      if (this.drcViolations.length === 0) {
        Row() {
          Text('✓')
            .fontSize(16)
            .fontColor(ProteusColors.ERC_OK)
            .margin({ right: 6 })
          Text('无 DRC 违规')
            .fontSize(ProteusFonts.STATUS)
            .fontColor(ProteusColors.ERC_OK)
        }
        .padding(12)
      } else {
        List() {
          ForEach(this.drcViolations, (v: PcbDrcViolation) => {
            ListItem() {
              Row() {
                Text(v.severity === PcbDrcSeverity.ERROR ? '✕' : '!')
                  .fontSize(12)
                  .fontColor(v.severity === PcbDrcSeverity.ERROR
                    ? ProteusColors.ERC_ERR : ProteusColors.ERC_WARN)
                  .width(16)
                Text(v.message)
                  .fontSize(ProteusFonts.STATUS)
                  .fontColor(v.severity === PcbDrcSeverity.ERROR
                    ? ProteusColors.ERC_ERR : ProteusColors.TEXT_LABEL)
                  .layoutWeight(1)
              }
              .padding({ left: 8, right: 8, top: 4, bottom: 4 })
              .width('100%')
            }
          }, (v: PcbDrcViolation) => v.id)
        }
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
      }
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  buildLayerTab() {
    Column() {
      ProteusPanelTitle({ title: 'Active Layer' })
      Text(this.activeLayer)
        .fontSize(ProteusFonts.PARAM_VALUE)
        .fontColor(ProteusColors.SELECTED)
        .fontWeight(FontWeight.Bold)
        .padding({ left: 12, top: 8, bottom: 8 })

      Text('在左侧 Layers 面板点击切换活动层。\n走线时自动切换到 Front Copper。')
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 12, right: 12 })
        .lineHeight(16)
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
  }
}
