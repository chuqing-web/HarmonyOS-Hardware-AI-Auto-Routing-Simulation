/**
 * ElecDraw 启动页 — 工业灰阶 CAD 风格
 */
import { ProteusFonts } from '../../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../../theme/ThemeManager';
import { ProteusClassicBtn, ProteusTextInput } from './ProteusWidgets';

/** 工业风色板 */
export class ProteusHomeColors {
  static readonly OUTER_BG: string = '#A8ADB4';
  static readonly WORKSPACE: string = '#B4B9C0';
  static readonly SIDEBAR_BG: string = '#C8CDD4';
  static readonly PANEL_BG: string = '#D8DCE2';
  static readonly PANEL_INSET: string = '#E4E7EC';
  static readonly PANEL_BORDER: string = '#6B7280';
  static readonly PANEL_BORDER_LIGHT: string = '#F2F4F7';
  static readonly PANEL_HEAD_BG: string = '#B0B6BE';
  static readonly PANEL_HEAD_TEXT: string = '#1A1F26';
  static readonly TOP_BAR: string = '#3A424D';
  static readonly TOP_BAR_BORDER: string = '#252B33';
  static readonly TOP_BAR_TITLE: string = '#EDEFF2';
  static readonly TOP_BAR_SUB: string = '#A8B0BA';
  static readonly ACCENT: string = '#2E5A88';
  static readonly ACCENT_SOFT: string = '#B8CCE0';
  static readonly ACCENT_HOVER: string = '#C8D6E4';
  static readonly LINK: string = '#1E4A72';
  static readonly TEXT: string = '#1F2937';
  static readonly TEXT_DIM: string = '#5C6570';
  static readonly RED: string = '#B83232';
  static readonly ROW_SEL: string = '#9BB4CE';
  static readonly ROW_SEL_TEXT: string = '#0F1720';
  static readonly BTN_FACE: string = '#C4C9D0';
  static readonly BTN_FACE_PRESSED: string = '#A8AEB6';
  static readonly BTN_PRIMARY: string = '#4A6FA5';
  static readonly BTN_PRIMARY_PRESSED: string = '#3D5E8F';
  static readonly BTN_PRIMARY_TEXT: string = '#FFFFFF';
  static readonly ROW_BORDER: string = '#9CA3AF';
  static readonly TABLE_HEAD_BG: string = '#B8BEC6';
  static readonly STATUS_BAR: string = '#3A424D';
  static readonly STATUS_TEXT: string = '#C8CDD4';
  static readonly STATUS_BORDER: string = '#252B33';
  static readonly HIGHLIGHT: string = '#4A6FA5';
  static readonly LISTBOX_BORDER: string = '#6B7280';
  static readonly DISABLED: string = '#8B939E';
}

export interface ProteusHomeNewsItem {
  description: string;
  releaseDate: string;
  uscValid: string;
  actionLabel: string;
  /** GitHub asset 直链；Download/Update 时有值 */
  downloadUrl?: string;
  hapFileName?: string;
  tagName?: string;
  /** 最新可更新行高亮 */
  highlightUpdate?: boolean;
}

export interface ProteusHomeLinkItem {
  label: string;
  tabEnabled: boolean;
}

/** 页面背景 — 纯平工业灰 */
@Component
export struct ProteusHomeBackdrop {
  @BuilderParam content: () => void;

  build() {
    Column() {
      this.content()
    }
    .width('100%')
    .height('100%')
    .backgroundColor(ProteusHomeColors.OUTER_BG)
  }
}

/** 分区标题条 — WinCAD 式 */
@Component
export struct ProteusHomeSectionTitle {
  @Prop title: string = '';

  build() {
    Row() {
      Text(this.title)
        .fontSize(11)
        .fontColor(ProteusHomeColors.PANEL_HEAD_TEXT)
        .fontWeight(FontWeight.Bold)
        .padding({ left: 8, top: 5, bottom: 4 })
    }
    .width('100%')
    .backgroundColor(ProteusHomeColors.PANEL_HEAD_BG)
    .border({
      width: { bottom: 1, top: 1 },
      color: ProteusHomeColors.PANEL_BORDER
    })
  }
}

/** 分区分隔线 */
@Component
export struct ProteusHomeSectionDivider {
  build() {
    Column()
      .width('100%')
      .height(1)
      .backgroundColor(ProteusHomeColors.PANEL_BORDER)
      .margin({ top: 2, bottom: 2 })
  }
}

/** 右栏面板 — 内凹边框 */
@Component
export struct ProteusHomePanel {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop title: string = '';
  @Prop subtitle: string = '';
  @Prop panelWeight: number = 1;
  @Prop highlighted: boolean = false;
  /** 标题旁小红点（如有可用更新） */
  @Prop showBadge: boolean = false;
  @BuilderParam body: () => void;

  build() {
    Column() {
      Row() {
        Text(this.title)
          .fontSize(11)
          .fontColor(ProteusHomeColors.PANEL_HEAD_TEXT)
          .fontWeight(FontWeight.Bold)
          .padding({ left: 8, top: 4, bottom: 4 })
        if (this.showBadge) {
          Circle()
            .width(7)
            .height(7)
            .fill(ProteusHomeColors.RED)
            .margin({ left: 6 })
        }
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)
      .backgroundColor(ProteusHomeColors.PANEL_HEAD_BG)
      .border({
        width: { bottom: 1 },
        color: ProteusHomeColors.PANEL_BORDER
      })

      Column() {
        this.body()
      }
      .width('100%')
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
      .backgroundColor(ProteusHomeColors.PANEL_INSET)
    }
    .width('100%')
    .layoutWeight(this.panelWeight)
    .backgroundColor(ProteusHomeColors.PANEL_BG)
    .border({
      width: this.highlighted ? 2 : 1,
      color: this.highlighted ? ProteusHomeColors.HIGHLIGHT : ProteusHomeColors.PANEL_BORDER
    })
    .clip(true)
  }
}

/** 顶栏 — 工业钢灰 */
@Component
export struct ProteusHomeTopBar {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop titleLine: string = 'Design Suite';
  @Prop versionLabel: string = '';
  /** 版本旁小红点（有可更新 Release） */
  @Prop showUpdateBadge: boolean = false;

  build() {
    Row() {
      Image($r('app.media.startIcon'))
        .width(24)
        .height(24)
        .objectFit(ImageFit.Contain)
        .margin({ right: 10 })
      Column() {
        Text('ElecDraw')
          .fontSize(13)
          .fontColor(ProteusHomeColors.TOP_BAR_TITLE)
          .fontWeight(FontWeight.Bold)
        Text(this.subtitleLine())
          .fontSize(9)
          .fontColor(ProteusHomeColors.TOP_BAR_SUB)
          .margin({ top: 1 })
      }
      .alignItems(HorizontalAlign.Start)
      Blank()
      if (this.versionLabel.length > 0) {
        Row() {
          Text(this.versionLabel)
            .fontSize(9)
            .fontColor(ProteusHomeColors.TOP_BAR_SUB)
          if (this.showUpdateBadge) {
            Circle()
              .width(7)
              .height(7)
              .fill(ProteusHomeColors.RED)
              .margin({ left: 6 })
          }
        }
        .alignItems(VerticalAlign.Center)
      }
    }
    .width('100%')
    .height(40)
    .padding({ left: 12, right: 12 })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(ProteusHomeColors.TOP_BAR)
    .border({ width: { bottom: 1 }, color: ProteusHomeColors.TOP_BAR_BORDER })
  }

  private subtitleLine(): string {
    if (this.titleLine.length > 0) {
      return this.titleLine;
    }
    return 'Design Suite';
  }
}

/** 侧栏导航 — 纯文本链 */
@Component
export struct ProteusHomeIconLink {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop label: string = '';
  @Prop iconTag: string = '';
  @Prop tabEnabled: boolean = true;
  /** true：仅双击触发 onAction（Getting Started 入口） */
  @Prop requireDoubleClick: boolean = false;
  onAction: () => void = () => {};
  @State private pressed: boolean = false;
  /** 双击判定：上次单击时间（非 @State，避免重建打断） */
  private lastClickMs: number = 0;

  private handleClick(): void {
    if (!this.tabEnabled) {
      return;
    }
    if (!this.requireDoubleClick) {
      this.onAction();
      return;
    }
    const now = Date.now();
    if (this.lastClickMs > 0 && now - this.lastClickMs <= 450) {
      this.lastClickMs = 0;
      this.onAction();
      return;
    }
    this.lastClickMs = now;
  }

  build() {
    Row() {
      Text(this.label)
        .fontSize(11)
        .fontColor(this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED)
        .decoration({
          type: this.tabEnabled ? TextDecorationType.Underline : TextDecorationType.None,
          color: this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED
        })
        .layoutWeight(1)
      if (!this.tabEnabled) {
        Text('N/A')
          .fontSize(8)
          .fontColor(ProteusHomeColors.DISABLED)
      }
    }
    .width('100%')
    .padding({ left: 10, right: 8, top: 3, bottom: 3 })
    .backgroundColor(this.pressed && this.tabEnabled ? ProteusHomeColors.ACCENT_HOVER : '#00000000')
    .onClick(() => this.handleClick())
    .onTouch((event: TouchEvent) => {
      // 双击入口避免 @State 刷新打断两次点击间隔判定
      if (this.requireDoubleClick) {
        return;
      }
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
  }
}

/** Start 区 — 工具栏文字链 */
@Component
export struct ProteusHomeInlineLink {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop label: string = '';
  @Prop tabEnabled: boolean = true;
  onAction: () => void = () => {};
  @State private pressed: boolean = false;

  build() {
    Text(this.label)
      .fontSize(11)
      .fontColor(this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED)
      .decoration({
        type: this.tabEnabled ? TextDecorationType.Underline : TextDecorationType.None,
        color: this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED
      })
      .padding({ left: 2, right: 2, top: 2, bottom: 2 })
      .backgroundColor(this.pressed && this.tabEnabled ? ProteusHomeColors.ACCENT_HOVER : '#00000000')
      .onClick(() => {
        if (this.tabEnabled) {
          this.onAction();
        }
      })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) {
          this.pressed = true;
        } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.pressed = false;
        }
      })
  }
}

/** 工程列表行 — 经典 ListBox 选中 */
@Component
export struct ProteusHomeRecentRow {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop name: string = '';
  @Prop selected: boolean = false;
  @Prop warn: boolean = false;
  onSelect: () => void = () => {};
  onOpen: () => void = () => {};

  private fg(): string {
    if (this.warn) {
      return ProteusHomeColors.RED;
    }
    if (this.selected) {
      return ProteusHomeColors.ROW_SEL_TEXT;
    }
    return ProteusHomeColors.TEXT;
  }

  build() {
    Text(this.name)
      .fontSize(11)
      .fontColor(this.fg())
      .width('100%')
      .padding({ left: 6, right: 6, top: 3, bottom: 3 })
      .maxLines(1)
      .textOverflow({ overflow: TextOverflow.Ellipsis })
      .backgroundColor(this.selected ? ProteusHomeColors.ROW_SEL : '#00000000')
      .onClick(() => this.onSelect())
      .gesture(TapGesture({ count: 2 }).onAction(() => this.onOpen()))
  }
}

/** 工业风按钮 */
@Component
export struct ProteusHomeDownloadBtn {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop label: string = 'Open';
  @Prop primary: boolean = true;
  @Prop btnEnabled: boolean = true;
  onAction: () => void = () => {};
  @State private pressed: boolean = false;

  private bg(): string {
    if (!this.btnEnabled) {
      return ProteusHomeColors.BTN_FACE;
    }
    if (this.primary) {
      return this.pressed ? ProteusHomeColors.BTN_PRIMARY_PRESSED : ProteusHomeColors.BTN_PRIMARY;
    }
    return this.pressed ? ProteusHomeColors.BTN_FACE_PRESSED : ProteusHomeColors.BTN_FACE;
  }

  private fg(): string {
    if (!this.btnEnabled) {
      return ProteusHomeColors.DISABLED;
    }
    return this.primary ? ProteusHomeColors.BTN_PRIMARY_TEXT : ProteusHomeColors.TEXT;
  }

  build() {
    Text(this.label)
      .fontSize(10)
      .fontColor(this.fg())
      .fontWeight(FontWeight.Medium)
      .textAlign(TextAlign.Center)
      .padding({ left: 14, right: 14 })
      .height(24)
      .backgroundColor(this.bg())
      .border({
        width: 1,
        color: this.primary ? ProteusHomeColors.BTN_PRIMARY_PRESSED : ProteusHomeColors.PANEL_BORDER
      })
      .opacity(this.btnEnabled ? 1 : 0.6)
      .onClick(() => {
        if (this.btnEnabled) {
          this.onAction();
        }
      })
      .onTouch((event: TouchEvent) => {
        if (!this.btnEnabled) {
          return;
        }
        if (event.type === TouchType.Down) {
          this.pressed = true;
        } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.pressed = false;
        }
      })
  }
}

/** About 信息行 */
@Component
export struct ProteusHomeAboutRow {
  @Prop label: string = '';
  @Prop value: string = '';
  @Prop warn: boolean = false;

  build() {
    Row() {
      Text(this.label)
        .fontSize(9)
        .fontColor(ProteusHomeColors.TEXT_DIM)
        .width('46%')
      Text(this.value)
        .fontSize(9)
        .fontColor(this.warn ? ProteusHomeColors.RED : ProteusHomeColors.TEXT)
        .layoutWeight(1)
        .textAlign(TextAlign.End)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .padding({ left: 8, right: 8, top: 2, bottom: 2 })
  }
}

/** News 表格行 */
@Component
export struct ProteusHomeNewsRow {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop description: string = '';
  @Prop releaseDate: string = '';
  @Prop uscValid: string = '';
  @Prop actionLabel: string = 'Download';
  @Prop showButton: boolean = true;
  @Prop isCurrent: boolean = false;
  @Prop highlightUpdate: boolean = false;
  @Prop btnEnabled: boolean = true;
  onAction: () => void = () => {};

  build() {
    Row() {
      Text(this.description)
        .fontSize(10)
        .fontColor(this.rowTextColor())
        .fontWeight(this.isCurrent || this.highlightUpdate ? FontWeight.Medium : FontWeight.Normal)
        .decoration({
          type: this.isCurrent ? TextDecorationType.None : TextDecorationType.Underline,
          color: this.highlightUpdate ? ProteusHomeColors.HIGHLIGHT : ProteusHomeColors.LINK
        })
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .padding({ left: 6 })
      Text(this.releaseDate)
        .fontSize(9)
        .fontColor(ProteusHomeColors.TEXT_DIM)
        .width(68)
        .textAlign(TextAlign.Center)
      Text(this.uscValid)
        .fontSize(9)
        .fontColor(ProteusHomeColors.TEXT_DIM)
        .width(36)
        .textAlign(TextAlign.Center)
      if (this.showButton) {
        ProteusHomeDownloadBtn({
          label: this.actionLabel,
          primary: this.highlightUpdate,
          btnEnabled: this.btnEnabled,
          onAction: () => this.onAction()
        })
          .margin({ right: 4 })
      } else {
        Text(this.actionLabel)
          .fontSize(9)
          .fontColor(ProteusHomeColors.ACCENT)
          .fontWeight(FontWeight.Medium)
          .width(64)
          .textAlign(TextAlign.Center)
      }
    }
    .width('100%')
    .height(26)
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.rowBg())
    .border({ width: { bottom: 1 }, color: ProteusHomeColors.ROW_BORDER })
  }

  private rowTextColor(): string {
    if (this.isCurrent) {
      return ProteusHomeColors.TEXT;
    }
    if (this.highlightUpdate) {
      return ProteusHomeColors.HIGHLIGHT;
    }
    return ProteusHomeColors.LINK;
  }

  private rowBg(): string {
    if (this.highlightUpdate) {
      return '#2A3548';
    }
    if (this.isCurrent) {
      return ProteusHomeColors.ACCENT_SOFT;
    }
    return '#00000000';
  }
}

/** News 卡片 — 保留兼容，内部转表格行样式 */
@Component
export struct ProteusHomeNewsCard {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop description: string = '';
  @Prop releaseDate: string = '';
  @Prop actionLabel: string = 'Download';
  @Prop isCurrent: boolean = false;
  @Prop showButton: boolean = true;
  onAction: () => void = () => {};

  build() {
    ProteusHomeNewsRow({
      description: this.description,
      releaseDate: this.releaseDate,
      uscValid: this.isCurrent ? 'Yes' : '—',
      actionLabel: this.actionLabel,
      showButton: this.showButton,
      isCurrent: this.isCurrent,
      onAction: () => this.onAction()
    })
  }
}

/** 首页公告栏 — 图片 + 文字（可由服务器接口填充；无网时显示本地预留图） */
@Component
export struct ProteusHomeAnnouncementPanel {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop @Watch('onImageUrlChange') imageUrl: string = '';
  @Prop title: string = '';
  @Prop body: string = '';
  @Prop publishedAt: string = '';
  @Prop loading: boolean = false;
  /** 相对 News 的高度权重，默认更大 */
  @Prop panelWeight: number = 2.4;
  @State private imageLoadFailed: boolean = false;

  onImageUrlChange(): void {
    this.imageLoadFailed = false;
  }

  private hasRemoteImage(): boolean {
    return this.imageUrl.length > 0 && !this.imageLoadFailed;
  }

  private hasText(): boolean {
    return this.title.length > 0 || this.body.length > 0 || this.publishedAt.length > 0;
  }

  build() {
    ProteusHomePanel({ title: 'Announcement', panelWeight: this.panelWeight }) {
      Column() {
        if (this.loading) {
          Column({ space: 8 }) {
            LoadingProgress()
              .width(28)
              .height(28)
              .color(ProteusHomeColors.TEXT_DIM)
            Text('Loading announcement…')
              .fontSize(10)
              .fontColor(ProteusHomeColors.TEXT_DIM)
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else {
          Column({ space: 8 }) {
            // 配图占剩余高度，Contain 保证完整可见、按比例自适应
            if (this.hasRemoteImage()) {
              Image(this.imageUrl)
                .width('100%')
                .layoutWeight(1)
                .objectFit(ImageFit.Contain)
                .borderRadius(4)
                .border({ width: 1, color: ProteusHomeColors.ROW_BORDER })
                .backgroundColor('#EEF1F5')
                .onError(() => {
                  this.imageLoadFailed = true;
                })
            } else {
              Image($r('app.media.announcement_default'))
                .width('100%')
                .layoutWeight(1)
                .objectFit(ImageFit.Contain)
                .borderRadius(4)
                .border({ width: 1, color: ProteusHomeColors.ROW_BORDER })
                .backgroundColor('#EEF1F5')
            }

            Scroll() {
              Column({ space: 6 }) {
                if (this.hasText()) {
                  this.AnnouncementTextBlock()
                } else {
                  Text('No announcement yet. Connect to the network to fetch the latest news.')
                    .fontSize(10)
                    .fontColor(ProteusHomeColors.TEXT_DIM)
                    .width('100%')
                    .lineHeight(15)
                }
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)
            }
            .width('100%')
            .constraintSize({ maxHeight: 140 })
            .scrollBar(BarState.Auto)
          }
          .width('100%')
          .height('100%')
          .padding({ left: 8, right: 8, top: 8, bottom: 8 })
          .alignItems(HorizontalAlign.Start)
        }
      }
      .width('100%')
      .height('100%')
      .alignItems(HorizontalAlign.Start)
    }
  }

  @Builder
  AnnouncementTextBlock() {
    Column({ space: 6 }) {
      if (this.title.length > 0) {
        Text(this.title)
          .fontSize(13)
          .fontColor(ProteusHomeColors.TEXT)
          .fontWeight(FontWeight.Bold)
          .width('100%')
          .maxLines(3)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      if (this.publishedAt.length > 0) {
        Text(this.publishedAt)
          .fontSize(9)
          .fontColor(ProteusHomeColors.TEXT_DIM)
          .width('100%')
      }
      if (this.body.length > 0) {
        Text(this.body)
          .fontSize(11)
          .fontColor(ProteusHomeColors.TEXT)
          .width('100%')
          .lineHeight(17)
          .opacity(0.92)
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }
}

/** New Project Wizard */
@Component
export struct ProteusHomeWizardDialog {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop step: number = 0;
  @Prop projectName: string = '';
  @Prop projectDir: string = '';
  /** 向导第二步模块说明，如 "PCB Layout" / "Schematic · Simulation" */
  @Prop modulesHint: string = 'Schematic · Simulation';
  /** true：Finish 后落盘创建工程文件 */
  @Prop willCreateFile: boolean = false;
  onNameChange: (v: string) => void = () => {};
  onCancel: () => void = () => {};
  onBack: () => void = () => {};
  onNext: () => void = () => {};
  onFinish: () => void = () => {};

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000055')
        .onClick(() => this.onCancel())

      Column() {
        Row() {
          Text('New Project')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusHomeColors.PANEL_HEAD_TEXT)
            .fontWeight(FontWeight.Bold)
            .layoutWeight(1)
            .padding({ left: 10 })
          Text('×')
            .fontSize(16)
            .fontColor(ProteusHomeColors.TEXT_DIM)
            .width(28)
            .textAlign(TextAlign.Center)
            .onClick(() => this.onCancel())
        }
        .width('100%')
        .height(32)
        .alignItems(VerticalAlign.Center)
        .backgroundColor(ProteusHomeColors.PANEL_HEAD_BG)
        .border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER })

        Column() {
          if (this.step === 0) {
            Text('Project name')
              .fontSize(11)
              .fontColor(ProteusHomeColors.TEXT)
              .width('100%')
              .margin({ bottom: 4 })
            Text(this.willCreateFile
              ? 'Finish 后将创建工程文件并进入编辑器。'
              : 'Save via File → Save in the editor. No file is created here.')
              .fontSize(9)
              .fontColor(ProteusHomeColors.TEXT_DIM)
              .width('100%')
              .margin({ bottom: 6 })
            Text(this.projectDir)
              .fontSize(9)
              .fontColor(ProteusHomeColors.TEXT_DIM)
              .width('100%')
              .maxLines(2)
              .margin({ bottom: 8 })
            ProteusTextInput({
              text: this.projectName,
              placeholder: 'MyProject',
              onChange: (v: string) => this.onNameChange(v),
              onSubmit: () => this.onNext()
            })
              .width('100%')
          } else {
            Text(`Name: ${this.projectName.length > 0 ? this.projectName : 'Untitled'}`)
              .fontSize(11)
              .fontColor(ProteusHomeColors.TEXT)
              .width('100%')
              .margin({ bottom: 4 })
            Text(`Modules: ${this.modulesHint}`)
              .fontSize(10)
              .fontColor(ProteusHomeColors.TEXT_DIM)
              .width('100%')
          }
        }
        .width('100%')
        .padding(12)
        .backgroundColor(ProteusHomeColors.PANEL_INSET)

        Row({ space: 6 }) {
          Blank()
          if (this.step > 0) {
            ProteusClassicBtn({ label: 'Back', widthVal: 68, onAction: () => this.onBack() })
          }
          ProteusClassicBtn({ label: 'Cancel', widthVal: 68, onAction: () => this.onCancel() })
          if (this.step === 0) {
            ProteusClassicBtn({ label: 'Next', widthVal: 68, onAction: () => this.onNext() })
          } else {
            ProteusClassicBtn({ label: 'Open', widthVal: 68, onAction: () => this.onFinish() })
          }
        }
        .width('100%')
        .padding({ left: 12, right: 12, top: 6, bottom: 12 })
        .backgroundColor(ProteusHomeColors.PANEL_INSET)
      }
      .width(380)
      .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
      .clip(true)
    }
    .width('100%')
    .height('100%')
  }
}

/** 帮助对话框 */
@Component
export struct ProteusHomeHelpDialog {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop title: string = '';
  @Prop body: string = '';
  @Prop primaryLabel: string = '';
  onPrimary: () => void = () => {};
  onClose: () => void = () => {};

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000055')
        .onClick(() => this.onClose())

      Column() {
        Row() {
          Text(this.title)
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusHomeColors.PANEL_HEAD_TEXT)
            .fontWeight(FontWeight.Bold)
            .layoutWeight(1)
            .padding({ left: 10 })
          Text('×')
            .fontSize(16)
            .fontColor(ProteusHomeColors.TEXT_DIM)
            .width(28)
            .textAlign(TextAlign.Center)
            .onClick(() => this.onClose())
        }
        .width('100%')
        .height(32)
        .alignItems(VerticalAlign.Center)
        .backgroundColor(ProteusHomeColors.PANEL_HEAD_BG)
        .border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER })

        Scroll() {
          Text(this.body)
            .fontSize(10)
            .fontColor(ProteusHomeColors.TEXT)
            .width('100%')
            .lineHeight(16)
        }
        .width('100%')
        .height(220)
        .padding(12)
        .backgroundColor(ProteusHomeColors.PANEL_INSET)
        .scrollBar(BarState.Auto)

        Row({ space: 6 }) {
          Blank()
          if (this.primaryLabel.length > 0) {
            ProteusHomeDownloadBtn({ label: this.primaryLabel, primary: false, onAction: () => this.onPrimary() })
          }
          ProteusHomeDownloadBtn({ label: 'Close', primary: true, onAction: () => this.onClose() })
        }
        .width('100%')
        .padding({ left: 12, right: 12, top: 6, bottom: 12 })
        .backgroundColor(ProteusHomeColors.PANEL_INSET)
      }
      .width(440)
      .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
      .clip(true)
    }
    .width('100%')
    .height('100%')
  }
}

/** 只读信息对话框 */
@Component
export struct ProteusHomeTextDialog {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop title: string = '';
  @Prop body: string = '';
  onClose: () => void = () => {};

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000055')
        .onClick(() => this.onClose())

      Column() {
        Row() {
          Text(this.title)
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusHomeColors.PANEL_HEAD_TEXT)
            .fontWeight(FontWeight.Bold)
            .layoutWeight(1)
            .padding({ left: 10 })
          Text('×')
            .fontSize(16)
            .fontColor(ProteusHomeColors.TEXT_DIM)
            .width(28)
            .textAlign(TextAlign.Center)
            .onClick(() => this.onClose())
        }
        .width('100%')
        .height(32)
        .alignItems(VerticalAlign.Center)
        .backgroundColor(ProteusHomeColors.PANEL_HEAD_BG)
        .border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER })

        Scroll() {
          Text(this.body)
            .fontSize(10)
            .fontColor(ProteusHomeColors.TEXT)
            .width('100%')
            .lineHeight(16)
        }
        .width('100%')
        .height(260)
        .padding(12)
        .backgroundColor(ProteusHomeColors.PANEL_INSET)
        .scrollBar(BarState.Auto)

        Row({ space: 6 }) {
          Blank()
          ProteusHomeDownloadBtn({ label: 'Close', primary: true, onAction: () => this.onClose() })
        }
        .width('100%')
        .padding({ left: 12, right: 12, top: 6, bottom: 12 })
        .backgroundColor(ProteusHomeColors.PANEL_INSET)
      }
      .width(440)
      .border({ width: 1, color: ProteusHomeColors.PANEL_BORDER })
      .clip(true)
    }
    .width('100%')
    .height('100%')
  }
}

/** 底部状态栏 — 深灰工业条 */
@Component
export struct ProteusHomeBottomStrip {
  @Prop statusLine: string = 'Ready';

  build() {
    Row() {
      Text('ElecDraw')
        .fontSize(9)
        .fontColor(ProteusHomeColors.STATUS_TEXT)
        .fontWeight(FontWeight.Medium)
        .margin({ right: 10 })
      Text(this.statusLine)
        .fontSize(9)
        .fontColor(ProteusHomeColors.STATUS_TEXT)
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(22)
    .padding({ left: 10, right: 10 })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(ProteusHomeColors.STATUS_BAR)
    .border({ width: { top: 1 }, color: ProteusHomeColors.STATUS_BORDER })
  }
}
