/**
 * 教学辅助面板 - 实验模板 / 知识点 / AI 答疑
 */
import { AppService } from '../services/AppService';
import { LabTemplate, KnowledgeTip } from 'ai_engine';
import { ProteusClassicBtn, ProteusSectionTitle } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';

@Component
export struct TeachingPanel {
  @Link statusMessage: string;
  @Prop selectedComponentId: string = '';
  @State templates: LabTemplate[] = [];
  @State tip: KnowledgeTip | null = null;
  @State stepIndex: number = 0;

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    this.templates = this.appService.teachingService.listTemplates();
  }

  build() {
    Column({ space: 6 }) {
      ProteusSectionTitle({ title: '教学辅助' })

      Text('实验模板库')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .padding({ left: 8 })
        .alignSelf(ItemAlign.Start)

      Column({ space: 4 }) {
        ForEach(this.templates, (tpl: LabTemplate) => {
          Row() {
            Column({ space: 2 }) {
              Text(tpl.name)
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(ProteusColors.TEXT_PRIMARY)
                .fontWeight(FontWeight.Medium)
              Text(tpl.description)
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(ProteusColors.TEXT_LABEL)
                .maxLines(3)
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)
            ProteusClassicBtn({
              label: '加载',
              widthVal: 52,
              onAction: () => {
                const r = this.appService.loadLabTemplate(tpl.id);
                if (r) {
                  this.statusMessage = `已加载实验: ${tpl.name}`;
                } else {
                  this.statusMessage = '模板加载失败';
                }
              }
            })
          }
          .width('100%')
          .padding({ left: 6, right: 6, top: 6, bottom: 6 })
          .backgroundColor(ProteusColors.INPUT_READONLY_BG)
          .border({ width: 1, color: ProteusColors.DIVIDER })
        }, (tpl: LabTemplate) => tpl.id)
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

      Text('分步上电仿真')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .padding({ left: 8 })
        .alignSelf(ItemAlign.Start)

      Text('逐步给电路上电，观察各节点电压变化，适合教学演示')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 8, right: 8 })
        .alignSelf(ItemAlign.Start)

      Row({ space: 6 }) {
        ProteusClassicBtn({
          label: '上一步',
          widthVal: '30%',
          onAction: () => {
            if (this.stepIndex > 0) {
              this.stepIndex--;
            }
            this.appService.stepPowerOn(this.stepIndex);
          }
        })
        Text(`步骤 ${this.stepIndex + 1}`)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .textAlign(TextAlign.Center)
          .layoutWeight(1)
        ProteusClassicBtn({
          label: '下一步',
          widthVal: '30%',
          onAction: () => {
            this.stepIndex++;
            this.appService.stepPowerOn(this.stepIndex);
            this.statusMessage = `分步上电: 步骤 ${this.stepIndex + 1}`;
          }
        })
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      if (this.selectedComponentId.length > 0) {
        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        Text('器件学习工具')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
          .fontWeight(FontWeight.Medium)
          .padding({ left: 8 })
          .alignSelf(ItemAlign.Start)

        Text(`已选中: ${this.selectedComponentId}`)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .padding({ left: 8 })
          .alignSelf(ItemAlign.Start)

        Column({ space: 6 }) {
          ProteusClassicBtn({
            label: '查看知识点',
            widthVal: '92%',
            onAction: () => {
              const dev = this.appService.getTopology().deviceList
                .find(d => d.instUuid === this.selectedComponentId);
              if (dev) {
                this.tip = this.appService.teachingService.getKnowledgeTip(dev.libDevId);
              }
            }
          })
          ProteusClassicBtn({
            label: 'AI 答疑',
            widthVal: '92%',
            onAction: async () => {
              const q = this.appService.teachingService.buildAiQuestion(
                this.appService.getTopology(), this.selectedComponentId);
              this.statusMessage = `AI 提问: ${q.substring(0, 40)}...`;
              await this.appService.aiGenerateCircuit(q);
            }
          })
        }
        .width('100%')
        .padding({ left: 8, right: 8 })
        .alignItems(HorizontalAlign.Start)
      }

      if (this.tip) {
        Column({ space: 4 }) {
          Text(this.tip.title)
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .fontWeight(FontWeight.Medium)
          Text(this.tip.content)
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
        }
        .width('92%')
        .padding({ left: 8, right: 8, top: 8, bottom: 8 })
        .backgroundColor(ProteusColors.INPUT_READONLY_BG)
        .border({ width: 1, color: ProteusColors.DIVIDER })
        .margin({ left: 8, top: 4 })
      }
    }
    .alignItems(HorizontalAlign.Start)
    .width('100%')
    .padding({ bottom: 12 })
    .backgroundColor(ProteusColors.CANVAS_BG)
  }
}
