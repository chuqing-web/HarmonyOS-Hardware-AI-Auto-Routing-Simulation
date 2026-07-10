/**
 * 故障注入仿真面板
 */
import { AppService } from '../services/AppService';
import { FaultType, FaultScanResult } from 'common';
import { ProteusClassicBtn, ProteusChipGrid, ProteusSectionTitle } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';

interface FaultTypeOption {
  type: string;
  label: string;
}

@Component
export struct FaultInjectionPanel {
  @Link statusMessage: string;
  @Prop @Watch('onSelectionChange') selectedComponentId: string = '';
  @State faultType: string = FaultType.RESISTOR_OPEN;
  @State scanResults: FaultScanResult[] = [];
  @State targetRefDes: string = '';

  private appService: AppService = AppService.getInstance();
  private faultOptions: FaultTypeOption[] = [
    { type: FaultType.RESISTOR_OPEN, label: '电阻开路' },
    { type: FaultType.RESISTOR_SHORT, label: '电阻短路' },
    { type: FaultType.CAP_LEAK, label: '电容漏电' },
    { type: FaultType.INDUCTOR_OPEN, label: '电感开路' },
    { type: FaultType.TRANSISTOR_BREAKDOWN, label: '晶体击穿' },
    { type: FaultType.MOS_DAMAGE, label: 'MOS损坏' },
    { type: FaultType.MCU_IO_SHORT, label: 'IO短路' },
    { type: FaultType.CRYSTAL_STOP, label: '晶振停振' },
    { type: FaultType.RESET_STUCK, label: '复位卡死' }
  ];

  private faultLabels: string[] = [
    '电阻开路', '电阻短路', '电容漏电', '电感开路', '晶体击穿',
    'MOS损坏', 'IO短路', '晶振停振', '复位卡死'
  ];

  aboutToAppear(): void {
    this.updateTargetLabel();
  }

  onSelectionChange(): void {
    this.updateTargetLabel();
  }

  private updateTargetLabel(): void {
    if (this.selectedComponentId.length === 0) {
      this.targetRefDes = '';
      return;
    }
    const doc = this.appService.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === this.selectedComponentId);
    this.targetRefDes = comp !== undefined ? comp.refDes : this.selectedComponentId;
  }

  private faultTypeIndex(): number {
    for (let i = 0; i < this.faultOptions.length; i++) {
      if (this.faultOptions[i].type === this.faultType) {
        return i;
      }
    }
    return 0;
  }

  build() {
    Scroll() {
      Column({ space: 6 }) {
        ProteusSectionTitle({ title: '故障注入仿真' })

        Text(this.targetRefDes.length > 0 ? `目标: ${this.targetRefDes}` : '目标: 请选中画布器件')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(this.targetRefDes.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY)
          .padding({ left: 8, right: 8 })
          .alignSelf(ItemAlign.Start)

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        Text('故障类型')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
          .fontWeight(FontWeight.Medium)
          .padding({ left: 8 })
          .alignSelf(ItemAlign.Start)

        ProteusChipGrid({
          labels: this.faultLabels,
          selectedIdx: this.faultTypeIndex(),
          colsPerRow: 3,
          onSelect: (idx: number) => {
            if (idx >= 0 && idx < this.faultOptions.length) {
              this.faultType = this.faultOptions[idx].type;
            }
          }
        })
        .padding({ left: 8, right: 8 })
        .width('100%')

        Row({ space: 6 }) {
          ProteusClassicBtn({
            label: '注入故障',
            widthVal: '48%',
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
            widthVal: '48%',
            onAction: () => {
              this.scanResults = this.appService.batchFaultScan();
              this.statusMessage = `扫描完成: ${this.scanResults.length} 种故障`;
            }
          })
        }
        .width('100%')
        .padding({ left: 8, right: 8 })

        ProteusClassicBtn({
          label: '清除全部故障',
          widthVal: '92%',
          onAction: () => {
            this.appService.clearFaults();
            this.scanResults = [];
            this.statusMessage = '故障注入已清除';
          }
        })
        .margin({ left: 8, right: 8 })

        if (this.scanResults.length > 0) {
          Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 4 })

          Text('AI 故障定位汇总')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .padding({ left: 8, top: 4 })
            .alignSelf(ItemAlign.Start)

          List({ space: 4 }) {
            ForEach(this.scanResults.slice(0, 15), (item: FaultScanResult) => {
              ListItem() {
                Column({ space: 2 }) {
                  Text(`${item.faultType}`)
                    .fontSize(ProteusFonts.PARAM_KEY)
                    .fontColor(ProteusColors.TEXT_PRIMARY)
                    .maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                  Text(item.waveSignature)
                    .fontSize(ProteusFonts.STATUS)
                    .fontColor(ProteusColors.TEXT_SECONDARY)
                    .maxLines(1)
                  if (item.aiDiagnosis.length > 0) {
                    Text(item.aiDiagnosis)
                      .fontSize(ProteusFonts.STATUS)
                      .fontColor(ProteusColors.HOVER_PREVIEW)
                      .maxLines(2)
                  }
                }
                .alignItems(HorizontalAlign.Start)
                .width('100%')
                .padding(6)
                .backgroundColor(ProteusColors.INPUT_READONLY_BG)
                .border({ width: 1, color: ProteusColors.DIVIDER })
              }
            }, (item: FaultScanResult) => `${item.faultType}_${item.targetUuid}`)
          }
          .width('100%')
          .padding({ left: 8, right: 8, bottom: 8 })
        }
      }
      .width('100%')
      .padding({ bottom: 8 })
    }
    .width('100%')
    .height('100%')
  }
}
