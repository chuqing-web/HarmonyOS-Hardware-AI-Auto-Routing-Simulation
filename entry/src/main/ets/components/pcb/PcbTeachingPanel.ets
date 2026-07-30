/**
 * PCB 教学面板 — 实验 PCB 模板库 / 知识点 / DRC
 */
import { AppService } from '../../services/AppService';
import { PcbLabTemplate } from 'ai_engine';
import { ProteusClassicBtn, ProteusSectionTitle } from '../proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../../theme/ProteusTheme';

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
export struct PcbTeachingPanel {
  @Link statusMessage: string;
  onRunDrc: () => void = () => {};
  onInserted: () => void = () => {};

  @State templates: PcbLabTemplate[] = [];
  @State activeCategory: string = 'all';
  @State selectedId: string = '';
  @State knowledgePoints: string[] = [];
  @State loading: boolean = false;

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    void this.appService.ensureTemplatesReady().then(() => {
      this.refreshTemplates();
    });
  }

  private refreshTemplates(): void {
    this.templates = this.appService.listAvailablePcbLabTemplates(this.activeCategory);
  }

  private selectTemplate(tpl: PcbLabTemplate): void {
    this.selectedId = tpl.id;
    this.knowledgePoints = tpl.knowledgePoints.slice();
  }

  private async insertSelected(): Promise<void> {
    if (this.selectedId.length === 0) {
      this.statusMessage = '请先选择一个 PCB 实验模板';
      return;
    }
    if (this.loading) {
      return;
    }
    this.loading = true;
    try {
      const ok = await this.appService.loadPcbLabTemplate(this.selectedId);
      if (ok) {
        this.onInserted();
      }
    } finally {
      this.loading = false;
    }
  }

  build() {
    Column({ space: 8 }) {
      ProteusSectionTitle({ title: 'PCB 教学' })

      Text('实验 PCB 模板（与原理图一一对应）')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .padding({ left: 8 })
        .alignSelf(ItemAlign.Start)

      Scroll() {
        Row({ space: 4 }) {
          ForEach(Array.from(CATEGORY_LABELS.keys()), (cat: string) => {
            Text(CATEGORY_LABELS.get(cat) ?? cat)
              .fontSize(10)
              .fontColor(this.activeCategory === cat ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_LABEL)
              .padding({ left: 8, right: 8, top: 4, bottom: 4 })
              .backgroundColor(this.activeCategory === cat ? ProteusColors.INPUT_READONLY_BG : 'transparent')
              .border({
                width: 1,
                color: this.activeCategory === cat ? ProteusColors.SELECTED : ProteusColors.DIVIDER
              })
              .borderRadius(4)
              .onClick(() => {
                this.activeCategory = cat;
                this.refreshTemplates();
              })
          }, (cat: string) => cat)
        }
      }
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)
      .width('100%')
      .padding({ left: 8, right: 8 })

      if (this.templates.length === 0) {
        Text('暂无可用 PCB 模板（请确认 Test_Template 含 .pcbsim）')
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .padding(12)
      } else {
        List({ space: 4 }) {
          ForEach(this.templates, (tpl: PcbLabTemplate) => {
            ListItem() {
              Column({ space: 2 }) {
                Text(tpl.name)
                  .fontSize(ProteusFonts.PARAM_KEY)
                  .fontColor(ProteusColors.TEXT_PRIMARY)
                  .fontWeight(FontWeight.Medium)
                Text(tpl.description)
                  .fontSize(10)
                  .fontColor(ProteusColors.TEXT_SECONDARY)
                  .maxLines(2)
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)
              .padding(8)
              .backgroundColor(ProteusColors.INPUT_READONLY_BG)
              .border({
                width: 1,
                color: this.selectedId === tpl.id ? ProteusColors.SELECTED : ProteusColors.DIVIDER
              })
              .borderRadius(4)
              .onClick(() => { this.selectTemplate(tpl); })
            }
          }, (tpl: PcbLabTemplate) => tpl.id)
        }
        .width('100%')
        .layoutWeight(1)
        .padding({ left: 8, right: 8 })
      }

      Row({ space: 6 }) {
        ProteusClassicBtn({
          label: this.loading ? '插入中…' : '插入模板',
          widthVal: '48%',
          onAction: () => { void this.insertSelected(); }
        })
        ProteusClassicBtn({
          label: '跑 DRC',
          widthVal: '48%',
          onAction: () => {
            this.onRunDrc();
            this.statusMessage = '已触发 DRC，结果见 DRC 页签';
          }
        })
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      if (this.knowledgePoints.length > 0) {
        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')
        Text('知识点 / 布线要点')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
          .fontWeight(FontWeight.Medium)
          .padding({ left: 8 })
          .alignSelf(ItemAlign.Start)
        Scroll() {
          Column({ space: 4 }) {
            ForEach(this.knowledgePoints, (tip: string, idx: number) => {
              Text(`${idx + 1}. ${tip}`)
                .fontSize(10)
                .fontColor(ProteusColors.TEXT_PRIMARY)
                .width('100%')
            }, (tip: string, idx: number) => `${idx}_${tip}`)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding({ left: 8, right: 8, bottom: 8 })
        }
        .layoutWeight(1)
        .width('100%')
      }
    }
    .width('100%')
    .height('100%')
    .alignItems(HorizontalAlign.Start)
  }
}
