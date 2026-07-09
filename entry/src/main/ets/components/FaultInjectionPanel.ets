/**
 * 故障注入仿真面板
 */
import { AppService } from '../services/AppService';
import { FaultType, FaultScanResult } from 'common';
import { ProteusClassicBtn } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';

@Component
export struct FaultInjectionPanel {
  @Link statusMessage: string;
  @Prop selectedComponentId: string = '';
  @State faultType: string = FaultType.RESISTOR_OPEN;
  @State scanResults: FaultScanResult[] = [];

  private appService: AppService = AppService.getInstance();
  private faultTypes: string[] = [
    FaultType.RESISTOR_OPEN, FaultType.RESISTOR_SHORT, FaultType.CAP_LEAK,
    FaultType.INDUCTOR_OPEN, FaultType.TRANSISTOR_BREAKDOWN, FaultType.MOS_DAMAGE,
    FaultType.MCU_IO_SHORT, FaultType.CRYSTAL_STOP, FaultType.RESET_STUCK
  ];

  build() {
    Scroll() {
      Column({ space: 6 }) {
        Text('故障注入仿真')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ left: 8, top: 6 })

        Text(`目标器件: ${this.selectedComponentId || '未选中'}`)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(this.selectedComponentId ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY)
          .margin({ left: 8 })
          .alignSelf(ItemAlign.Start)

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 4 })

        Text('选择故障类型')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_LABEL)
          .fontWeight(FontWeight.Medium)
          .margin({ left: 8, top: 4 })
          .alignSelf(ItemAlign.Start)

        Column({ space: 4 }) {
          Row({ space: 4 }) {
            ForEach(this.faultTypes.slice(0, 5), (ft: string) => {
              Text(ft)
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(this.faultType === ft ? '#FFFFFF' : ProteusColors.TEXT_PRIMARY)
                .padding({ left: 6, right: 6, top: 3, bottom: 3 })
                .backgroundColor(this.faultType === ft ? ProteusColors.SELECTED : ProteusColors.BTN_BG)
                .border({ width: 1, color: this.faultType === ft ? ProteusColors.SELECTED : ProteusColors.DIVIDER })
                .onClick(() => { this.faultType = ft; })
            }, (ft: string) => ft)
          }
          Row({ space: 4 }) {
            ForEach(this.faultTypes.slice(5, 9), (ft: string) => {
              Text(ft)
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(this.faultType === ft ? '#FFFFFF' : ProteusColors.TEXT_PRIMARY)
                .padding({ left: 6, right: 6, top: 3, bottom: 3 })
                .backgroundColor(this.faultType === ft ? ProteusColors.SELECTED : ProteusColors.BTN_BG)
                .border({ width: 1, color: this.faultType === ft ? ProteusColors.SELECTED : ProteusColors.DIVIDER })
                .onClick(() => { this.faultType = ft; })
            }, (ft: string) => ft)
          }
        }
        .padding({ left: 8, right: 8 })
        .width('100%')

        Row({ space: 6 }) {
          ProteusClassicBtn({
            label: '注入故障',
            widthVal: '30%',
            onAction: () => {
              if (!this.selectedComponentId) {
                this.statusMessage = '请先选中器件';
                return;
              }
              const r = this.appService.injectFault(this.selectedComponentId, this.faultType as FaultType);
              this.statusMessage = r.success ? `已注入 ${this.faultType}` : `注入失败: ${r.error}`;
            }
          })
          ProteusClassicBtn({
            label: '批量扫描',
            widthVal: '30%',
            onAction: () => {
              this.scanResults = this.appService.batchFaultScan();
              this.statusMessage = `扫描完成: ${this.scanResults.length} 种故障`;
            }
          })
          ProteusClassicBtn({
            label: '清除全部',
            widthVal: '30%',
            onAction: () => {
              this.appService.clearFaults();
              this.scanResults = [];
              this.statusMessage = '故障注入已清除';
            }
          })
        }
        .width('100%')
        .padding({ left: 8, right: 8 })
        .justifyContent(FlexAlign.SpaceBetween)

        if (this.scanResults.length > 0) {
          Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 6 })

          Text('AI 故障定位汇总')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .margin({ left: 8, top: 4 })
            .alignSelf(ItemAlign.Start)

          List({ space: 4 }) {
            ForEach(this.scanResults.slice(0, 15), (item: FaultScanResult) => {
              ListItem() {
                Column({ space: 2 }) {
                  Text(`${item.faultType} @ ${item.targetUuid.substring(0, 8)}`)
                    .fontSize(ProteusFonts.PARAM_KEY)
                    .fontColor(ProteusColors.TEXT_PRIMARY)
                    .fontWeight(FontWeight.Medium)
                  Text(item.aiDiagnosis)
                    .fontSize(ProteusFonts.PARAM_KEY)
                    .fontColor(ProteusColors.TEXT_LABEL)
                    .maxLines(3)
                }
                .alignItems(HorizontalAlign.Start)
                .padding(6)
              }
            }, (item: FaultScanResult) => `${item.faultType}_${item.targetUuid}`)
          }
          .constraintSize({ minHeight: 80, maxHeight: 200 })
          .margin({ left: 8, right: 8 })
        }
      }
      .alignItems(HorizontalAlign.Start)
      .width('100%')
      .padding({ bottom: 8 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
  }
}
