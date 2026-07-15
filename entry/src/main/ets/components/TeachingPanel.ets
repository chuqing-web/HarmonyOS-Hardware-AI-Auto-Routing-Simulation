/**
 * 教学辅助面板 - 实验模板库 / 器件覆盖 / AI 答疑
 */
import { AppService } from '../services/AppService';
import { LabTemplate, KnowledgeTip, LabCoverageReport } from 'ai_engine';
import { ProteusClassicBtn, ProteusSectionTitle } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';

const CATEGORY_LABELS: Map<string, string> = new Map([
  ['all', '全部'],
  ['power', '电源'],
  ['analog', '模拟'],
  ['passive', '无源'],
  ['discrete', '分立'],
  ['digital', '数字'],
  ['memory', '存储'],
  ['mcu', 'MCU'],
  ['peripheral', '外设'],
  ['sensor', '传感器'],
  ['instrument', '仪器']
]);

@Component
export struct TeachingPanel {
  @Link statusMessage: string;
  @Prop selectedComponentId: string = '';
  @State templates: LabTemplate[] = [];
  @State tip: KnowledgeTip | null = null;
  @State stepIndex: number = 0;
  @State activeCategory: string = 'all';
  @State coverage: LabCoverageReport = { covered: [], missing: [], total: 0, percent: 0 };
  @State showCoverage: boolean = false;
  @State templateDir: string = '';
  @State hexDir: string = '';

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    this.templateDir = this.appService.getTemplateDir();
    this.hexDir = this.appService.getHexDir();
    this.refreshTemplates();
  }

  private refreshTemplates(): void {
    this.templateDir = this.appService.getTemplateDir();
    this.hexDir = this.appService.getHexDir();
    this.coverage = this.appService.teachingService.getCoverageReport();
    this.templates = this.appService.listAvailableLabTemplates(this.activeCategory);
  }

  /** 需烧录固件的模板标注：文件名 + 就绪状态 */
  private getTemplateHexHint(tpl: LabTemplate): string {
    const hexName = tpl.hexFile !== undefined && tpl.hexFile.length > 0
      ? tpl.hexFile
      : this.appService.teachingService.getTemplateHexFileName(tpl.id);
    if (hexName === null || hexName.length === 0) {
      return '';
    }
    const fw = tpl.firmware !== undefined && tpl.firmware.length > 0
      ? tpl.firmware
      : (this.appService.teachingService.getTemplateFirmware(tpl.id)?.mcuFamily ?? '');
    const fwTag = fw.length > 0 ? `（${fw}）` : '';
    const hexPath = this.appService.getTemplateHexPath(tpl.id);
    const ready = hexPath !== null && this.appService.isHexFileReady(hexPath);
    if (ready) {
      return `需烧录: ${hexName}${fwTag}`;
    }
    return `需烧录: ${hexName}${fwTag}（文件缺失）`;
  }

  private templateNeedsHex(tpl: LabTemplate): boolean {
    if (tpl.hexFile !== undefined && tpl.hexFile.length > 0) {
      return true;
    }
    const name = this.appService.teachingService.getTemplateHexFileName(tpl.id);
    return name !== null && name.length > 0;
  }

  build() {
    Column({ space: 6 }) {
      ProteusSectionTitle({ title: '教学辅助' })

      Row() {
        Text(`器件库覆盖 ${this.coverage.percent}% (${this.coverage.covered.length}/${this.coverage.total})`)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(this.coverage.percent >= 100 ? ProteusColors.ERC_OK : ProteusColors.TEXT_LABEL)
          .layoutWeight(1)
        ProteusClassicBtn({
          label: this.showCoverage ? '收起' : '详情',
          widthVal: 48,
          onAction: () => { this.showCoverage = !this.showCoverage; }
        })
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      if (this.showCoverage && this.coverage.missing.length > 0) {
        Text(`未覆盖: ${this.coverage.missing.join(', ')}`)
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .padding({ left: 8, right: 8 })
          .width('100%')
      }

      Text('实验模板库')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .padding({ left: 8 })
        .alignSelf(ItemAlign.Start)

      Text(`模板: ${this.templateDir}`)
        .fontSize(9)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 8, right: 8 })
        .width('100%')
        .maxLines(2)
      Text(`固件: ${this.hexDir}`)
        .fontSize(9)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 8, right: 8, bottom: 4 })
        .width('100%')
        .maxLines(2)

      Scroll() {
        Row({ space: 4 }) {
          ForEach(Array.from(CATEGORY_LABELS.keys()), (cat: string) => {
            Text(CATEGORY_LABELS.get(cat) ?? cat)
              .fontSize(10)
              .fontColor(this.activeCategory === cat ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_LABEL)
              .backgroundColor(this.activeCategory === cat ? ProteusColors.INPUT_READONLY_BG : 'transparent')
              .padding({ left: 8, right: 8, top: 4, bottom: 4 })
              .border({
                width: 1,
                color: this.activeCategory === cat ? ProteusColors.SELECTED : ProteusColors.DIVIDER
              })
              .onClick(() => {
                this.activeCategory = cat;
                this.refreshTemplates();
              })
          }, (cat: string) => cat)
        }
        .padding({ left: 8, right: 8 })
      }
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)
      .width('100%')
      .height(32)

      Column({ space: 4 }) {
        ForEach(this.templates, (tpl: LabTemplate) => {
          Row() {
            Column({ space: 2 }) {
              Row({ space: 6 }) {
                Text(tpl.name)
                  .fontSize(ProteusFonts.PARAM_KEY)
                  .fontColor(ProteusColors.TEXT_PRIMARY)
                  .fontWeight(FontWeight.Medium)
                Text(tpl.category)
                  .fontSize(9)
                  .fontColor(ProteusColors.TEXT_SECONDARY)
                  .padding({ left: 4, right: 4, top: 1, bottom: 1 })
                  .backgroundColor(ProteusColors.INPUT_READONLY_BG)
                if (this.templateNeedsHex(tpl)) {
                  Text('需烧录')
                    .fontSize(9)
                    .fontColor('#FFFFFF')
                    .fontWeight(FontWeight.Medium)
                    .padding({ left: 5, right: 5, top: 1, bottom: 1 })
                    .backgroundColor(ProteusColors.ERC_WARN)
                }
              }
              Text(tpl.description)
                .fontSize(ProteusFonts.PARAM_KEY)
                .fontColor(ProteusColors.TEXT_LABEL)
                .maxLines(2)
              if (tpl.libraryIds !== undefined && tpl.libraryIds.length > 0) {
                Text(`${tpl.libraryIds.length} 种器件`)
                  .fontSize(9)
                  .fontColor(ProteusColors.TEXT_SECONDARY)
              }
              if (this.templateNeedsHex(tpl)) {
                Text(this.getTemplateHexHint(tpl))
                  .fontSize(10)
                  .fontColor(ProteusColors.ERC_WARN)
                  .fontWeight(FontWeight.Medium)
                  .maxLines(2)
              }
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)
            ProteusClassicBtn({
              label: '插入',
              widthVal: 52,
              onAction: () => {
                void this.appService.loadLabTemplate(tpl.id).then((r) => {
                  if (!r) {
                    this.statusMessage =
                      `模板插入失败: ${this.templateDir}/${tpl.id}.schsim`;
                  }
                });
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
