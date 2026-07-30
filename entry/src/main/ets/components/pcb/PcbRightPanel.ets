/**
 * PCB 右侧面板 — 属性 / DRC / 封装 / 层栈
 */
import {
  PcbDrcViolation, PcbDrcSeverity, PcbLayerId, PcbFootprintDef, PcbViaKind,
  PcbRouteCornerMode, PcbStackLayer, PcbStackLayerType, PcbDocument,
  getGlobalPcbFootprintLibrary
} from 'common';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../../theme/ThemeManager';
import { ProteusClassicBtn, ProteusChipTab, ProteusPanelTitle } from '../proteus/ProteusWidgets';
import { PcbTeachingPanel } from './PcbTeachingPanel';
import { PcbGerberPreview } from './PcbGerberPreview';

enum PcbRightTab {
  PROPERTIES = 0,
  DRC = 1,
  LIBRARY = 2,
  STACK = 3,
  GERBER = 4,
  TEACHING = 5
}

@Component
export struct PcbRightPanel {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop panelWidth: number = 260;
  @Prop selectionInfo: string = '';
  @Prop selectedZoneId: string = '';
  @Prop selectedZoneCount: number = 0;
  @Prop activeLayer: PcbLayerId = PcbLayerId.F_CU;
  @Prop drcViolations: PcbDrcViolation[] = [];
  @Prop selectedFpDefId: string = '';
  @Prop copperCount: number = 2;
  @Prop stackLayers: PcbStackLayer[] = [];
  @Prop viaKind: PcbViaKind = PcbViaKind.THROUGH;
  @Prop viaFrom: PcbLayerId = PcbLayerId.F_CU;
  @Prop viaTo: PcbLayerId = PcbLayerId.B_CU;
  @Prop copperLayerIds: PcbLayerId[] = [PcbLayerId.F_CU, PcbLayerId.B_CU];
  @Prop routeCornerMode: PcbRouteCornerMode = PcbRouteCornerMode.ORTHO45;
  onZonePriority: (delta: number) => void = (_d: number) => {};
  onZoneThermal: () => void = () => {};
  onZoneRefreshCutouts: () => void = () => {};
  onPickFootprint: (defId: string) => void = (_id: string) => {};
  onSetRouteCorner: (mode: PcbRouteCornerMode) => void = (_m: PcbRouteCornerMode) => {};
  onSetCopperCount: (n: number) => void = (_n: number) => {};
  onSetViaKind: (k: PcbViaKind) => void = (_k: PcbViaKind) => {};
  onSetViaSpan: (from: PcbLayerId, to: PcbLayerId) => void = (_f: PcbLayerId, _t: PcbLayerId) => {};
  onSetAppearanceActiveOnly: () => void = () => {};
  onSetAppearanceDim: () => void = () => {};
  onSetAppearanceOverlay: () => void = () => {};
  onRunDrc: () => void = () => {};
  onPcbTemplateInserted: () => void = () => {};
  onExportGerber: () => void = () => {};
  getPcbDocument: () => PcbDocument | null = () => null;
  @Prop gerberDocRev: number = 0;

  @State private activeTab: PcbRightTab = PcbRightTab.PROPERTIES;
  @State private fpDefs: PcbFootprintDef[] = [];
  @State private teachStatus: string = '';

  aboutToAppear(): void {
    this.fpDefs = getGlobalPcbFootprintLibrary().listDefs();
  }

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
          label: '封装',
          selected: this.activeTab === PcbRightTab.LIBRARY,
          fillWidth: true,
          onSelect: () => {
            this.fpDefs = getGlobalPcbFootprintLibrary().listDefs();
            this.activeTab = PcbRightTab.LIBRARY;
          }
        })
        ProteusChipTab({
          label: '层栈',
          selected: this.activeTab === PcbRightTab.STACK,
          fillWidth: true,
          onSelect: () => { this.activeTab = PcbRightTab.STACK; }
        })
        ProteusChipTab({
          label: 'Gerber',
          selected: this.activeTab === PcbRightTab.GERBER,
          fillWidth: true,
          onSelect: () => { this.activeTab = PcbRightTab.GERBER; }
        })
        ProteusChipTab({
          label: '教学',
          selected: this.activeTab === PcbRightTab.TEACHING,
          fillWidth: true,
          onSelect: () => { this.activeTab = PcbRightTab.TEACHING; }
        })
      }
      .width('100%')
      .padding({ left: 4, right: 4, top: 4, bottom: 4 })
      .backgroundColor(ProteusColors.PANEL_TITLE_BG)

      if (this.activeTab === PcbRightTab.PROPERTIES) {
        this.buildPropertiesTab()
      } else if (this.activeTab === PcbRightTab.DRC) {
        this.buildDrcTab()
      } else if (this.activeTab === PcbRightTab.LIBRARY) {
        this.buildLibraryTab()
      } else if (this.activeTab === PcbRightTab.STACK) {
        this.buildStackTab()
      } else if (this.activeTab === PcbRightTab.GERBER) {
        PcbGerberPreview({
          docRev: this.gerberDocRev,
          getDocument: (): PcbDocument | null => this.getPcbDocument(),
          onExport: () => { this.onExportGerber(); }
        })
      } else {
        PcbTeachingPanel({
          statusMessage: $teachStatus,
          onRunDrc: () => { this.onRunDrc(); },
          onInserted: () => { this.onPcbTemplateInserted(); }
        })
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

      Text(`活动层: ${this.activeLayer}`)
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 10, right: 10, bottom: 8 })

      if (this.selectedZoneId.length > 0) {
        ProteusPanelTitle({ title: '覆铜编辑' })
        if (this.selectedZoneCount > 1) {
          Text(`已选 ${this.selectedZoneCount} 个覆铜 — 操作作用于全部`)
            .fontSize(10)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .padding({ left: 10, right: 10, bottom: 4 })
        }
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
  buildLibraryTab() {
    Column() {
      ProteusPanelTitle({ title: 'Footprint Library' })
      Text(this.selectedFpDefId.length > 0
        ? `已选: ${this.selectedFpDefId}`
        : '点击条目后使用放置工具 (P)')
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 10, right: 10, bottom: 6 })
      List() {
        ForEach(this.fpDefs, (def: PcbFootprintDef) => {
          ListItem() {
            Row() {
              Text(def.name)
                .fontSize(ProteusFonts.STATUS)
                .fontColor(def.id === this.selectedFpDefId
                  ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY)
                .fontWeight(def.id === this.selectedFpDefId ? FontWeight.Bold : FontWeight.Normal)
                .layoutWeight(1)
              Text(`${def.pads.length} pads`)
                .fontSize(10)
                .fontColor(ProteusColors.TEXT_SECONDARY)
            }
            .width('100%')
            .padding({ left: 10, right: 10, top: 6, bottom: 6 })
            .backgroundColor(def.id === this.selectedFpDefId
              ? ProteusColors.TOOL_ACTIVE : Color.Transparent)
            .onClick(() => { this.onPickFootprint(def.id); })
          }
        }, (def: PcbFootprintDef) => def.id)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Auto)
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  buildStackTab() {
    Scroll() {
      Column() {
        ProteusPanelTitle({ title: '铜层层数' })
        Row({ space: 4 }) {
          ProteusClassicBtn({
            label: '2L',
            widthVal: 48,
            onAction: () => { this.onSetCopperCount(2); }
          })
          ProteusClassicBtn({
            label: '4L',
            widthVal: 48,
            onAction: () => { this.onSetCopperCount(4); }
          })
          ProteusClassicBtn({
            label: '6L',
            widthVal: 48,
            onAction: () => { this.onSetCopperCount(6); }
          })
          ProteusClassicBtn({
            label: '8L',
            widthVal: 48,
            onAction: () => { this.onSetCopperCount(8); }
          })
        }
        .padding({ left: 8, right: 8, bottom: 8 })
        Text(`当前: ${this.copperCount} 层铜`)
          .fontSize(10)
          .fontColor(ProteusColors.SELECTED)
          .padding({ left: 10, bottom: 6 })

        ProteusPanelTitle({ title: '显示过滤' })
        Row({ space: 4 }) {
          ProteusClassicBtn({
            label: '叠加',
            widthVal: 56,
            onAction: () => { this.onSetAppearanceOverlay(); }
          })
          ProteusClassicBtn({
            label: '变暗',
            widthVal: 56,
            onAction: () => { this.onSetAppearanceDim(); }
          })
          ProteusClassicBtn({
            label: '仅活动',
            widthVal: 56,
            onAction: () => { this.onSetAppearanceActiveOnly(); }
          })
        }
        .padding({ left: 8, right: 8, bottom: 8 })

        ProteusPanelTitle({ title: '布线拐角' })
        Row({ space: 4 }) {
          ProteusClassicBtn({
            label: '90°',
            widthVal: 56,
            onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ORTHO90); }
          })
          ProteusClassicBtn({
            label: '45°',
            widthVal: 56,
            onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ORTHO45); }
          })
          ProteusClassicBtn({
            label: '圆弧',
            widthVal: 56,
            onAction: () => { this.onSetRouteCorner(PcbRouteCornerMode.ARC); }
          })
        }
        .padding({ left: 8, right: 8, bottom: 4 })
        Text(`当前: ${this.routeCornerMode === PcbRouteCornerMode.ORTHO90 ? '直角90°' :
          (this.routeCornerMode === PcbRouteCornerMode.ARC ? '圆弧' : '45°斜角')}`)
          .fontSize(10)
          .fontColor(ProteusColors.SELECTED)
          .padding({ left: 10, bottom: 8 })

        ProteusPanelTitle({ title: '过孔类型 / 跨度' })
        Row({ space: 4 }) {
          ProteusClassicBtn({
            label: '通孔',
            widthVal: 56,
            onAction: () => { this.onSetViaKind(PcbViaKind.THROUGH); }
          })
          ProteusClassicBtn({
            label: '盲孔',
            widthVal: 56,
            onAction: () => { this.onSetViaKind(PcbViaKind.BLIND); }
          })
          ProteusClassicBtn({
            label: '埋孔',
            widthVal: 56,
            onAction: () => { this.onSetViaKind(PcbViaKind.BURIED); }
          })
        }
        .padding({ left: 8, right: 8, bottom: 4 })
        Text(`类型: ${this.viaKind}`)
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .padding({ left: 10, bottom: 4 })
        Text(`跨度: ${this.viaFrom} → ${this.viaTo}`)
          .fontSize(10)
          .fontColor(ProteusColors.SELECTED)
          .padding({ left: 10, bottom: 6 })

        Text('起点层')
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_LABEL)
          .padding({ left: 10, bottom: 2 })
        this.viaLayerPickRow(true)
        Text('终点层')
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_LABEL)
          .padding({ left: 10, top: 4, bottom: 2 })
        this.viaLayerPickRow(false)

        ProteusPanelTitle({ title: '物理层栈' })
        ForEach(this.stackLayers, (sl: PcbStackLayer) => {
          Row() {
            Column()
              .width(4)
              .height(18)
              .backgroundColor(this.stackColor(sl))
              .margin({ right: 6 })
            Text(sl.name)
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Text(`${sl.thicknessMm.toFixed(3)} mm`)
              .fontSize(10)
              .fontColor(ProteusColors.TEXT_SECONDARY)
            Text(sl.type === PcbStackLayerType.COPPER ? 'Cu' :
              (sl.type === PcbStackLayerType.DIELECTRIC ? 'Diel' : 'Mask'))
              .fontSize(9)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .width(32)
              .textAlign(TextAlign.End)
          }
          .width('100%')
          .padding({ left: 10, right: 10, top: 3, bottom: 3 })
        }, (sl: PcbStackLayer) => sl.id)
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
    }
    .layoutWeight(1)
    .scrollBar(BarState.Auto)
  }

  @Builder
  viaLayerPickRow(isFrom: boolean) {
    Flex({ wrap: FlexWrap.Wrap }) {
      ForEach(this.copperLayerIds, (id: PcbLayerId) => {
        Button({ type: ButtonType.Normal }) {
          Text(id)
            .fontSize(9)
            .fontColor((isFrom ? this.viaFrom : this.viaTo) === id
              ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY)
        }
        .height(22)
        .padding({ left: 4, right: 4 })
        .margin({ right: 4, bottom: 4 })
        .backgroundColor((isFrom ? this.viaFrom : this.viaTo) === id
          ? ProteusColors.TOOL_ACTIVE : ProteusColors.BTN_BG)
        .border({ width: 1, color: ProteusColors.BORDER })
        .borderRadius(0)
        .stateEffect(false)
        .onClick(() => {
          if (isFrom) {
            this.onSetViaSpan(id, this.viaTo);
          } else {
            this.onSetViaSpan(this.viaFrom, id);
          }
        })
      }, (id: PcbLayerId) => `${isFrom ? 'f' : 't'}_${id}`)
    }
    .padding({ left: 8, right: 8 })
  }

  private stackColor(sl: PcbStackLayer): string {
    if (sl.type === PcbStackLayerType.COPPER) {
      return '#C83434';
    }
    if (sl.type === PcbStackLayerType.DIELECTRIC) {
      return '#C8A878';
    }
    return '#2E8B57';
  }
}
