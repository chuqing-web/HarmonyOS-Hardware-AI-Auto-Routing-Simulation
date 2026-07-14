/**
 * Proteus 风格可复用 UI 组件 — 使用 Button 确保 2in1/鼠标点击可靠
 */
import { ProteusColors, ProteusDimens, ProteusFonts } from '../../theme/ProteusTheme';
import { ProteusIcon, ProteusIconName } from './ProteusIcons';

/** 经典凹陷边框：抬起=亮上左/暗下右；按下=反转 */
function proteusBtnBorder(pressed: boolean): BorderOptions {
  if (pressed) {
    return {
      width: { left: 1, top: 1, right: 1, bottom: 1 },
      color: { left: '#808080', top: '#808080', right: '#F5F5F5', bottom: '#F5F5F5' }
    };
  }
  return {
    width: { left: 1, top: 1, right: 1, bottom: 1 },
    color: { left: '#F5F5F5', top: '#F5F5F5', right: '#808080', bottom: '#808080' }
  };
}

/** 统一悬停提示气泡 */
@Builder
export function ProteusTooltipBubble(text: string) {
  Column() {
    Text(text)
      .fontSize(12)
      .fontColor('#FFFFFF')
      .textAlign(TextAlign.Center)
      .maxLines(4)
      .textOverflow({ overflow: TextOverflow.Ellipsis })
  }
  .padding({ left: 10, right: 10, top: 6, bottom: 6 })
  .backgroundColor('#E6383838')
  .borderRadius(4)
  .constraintSize({ maxWidth: 320 })
  .shadow({ radius: 6, color: '#40000000', offsetX: 0, offsetY: 2 })
}

export interface ProteusMenuEntry {
  label: ResourceStr;
  shortcut?: string;
  icon?: ProteusIconName;
  separator?: boolean;
  disabled?: boolean;
  action: () => void;
}

@Component
export struct ProteusPanelTitle {
  @Prop title: ResourceStr = '';
  @Prop collapsed: boolean = false;
  @Prop tooltip: string = '';
  onToggle: () => void = () => {};
  @State private tipVisible: boolean = false;
  @State private pressed: boolean = false;

  private tipText(): string {
    if (this.tooltip.length > 0) {
      return this.tooltip;
    }
    return this.collapsed ? '点击展开面板' : '点击折叠面板';
  }

  build() {
    Row() {
      Text(this.title)
        .fontSize(ProteusFonts.TITLE)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Medium)
        .layoutWeight(1)
        .textAlign(TextAlign.Center)
      Text(this.collapsed ? '▶' : '▼')
        .fontSize(8)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .margin({ right: 4 })
    }
    .width('100%')
    .height(ProteusDimens.PANEL_TITLE_HEIGHT)
    .backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED : ProteusColors.PANEL_TITLE_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
    .alignItems(VerticalAlign.Center)
    .scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 })
    .onClick(() => this.onToggle())
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onHover((hover: boolean) => {
      this.tipVisible = hover;
    })
    .bindPopup(this.tipVisible, {
      builder: this.panelTitleTip,
      placement: Placement.Bottom,
      enableArrow: true,
      popupColor: Color.Transparent,
      mask: false,
      onStateChange: (event) => {
        if (!event.isVisible) {
          this.tipVisible = false;
        }
      }
    })
  }

  @Builder
  panelTitleTip() {
    ProteusTooltipBubble(this.tipText())
  }
}

@Component
export struct ProteusVDivider {
  build() {
    Column()
      .width(1)
      .height(ProteusDimens.TOOLBAR_HEIGHT - 8)
      .backgroundColor(ProteusColors.DIVIDER)
      .margin({ left: 2, right: 2 })
  }
}

@Component
export struct ProteusToolBtn {
  @Prop label: string = '';
  @Prop active: boolean = false;
  onAction: () => void = () => {};
  @State private pressed: boolean = false;

  private bg(): string {
    if (this.pressed) {
      return ProteusColors.BTN_PRESSED;
    }
    return this.active ? ProteusColors.TREE_SELECTED : ProteusColors.BTN_BG;
  }

  build() {
    Button({ type: ButtonType.Normal }) {
      Text(this.label)
        .fontSize(ProteusFonts.TOOLBAR)
        .fontColor(ProteusColors.TEXT_PRIMARY)
    }
    .width(ProteusDimens.TOOL_BTN_SIZE)
    .height(ProteusDimens.TOOL_BTN_SIZE)
    .padding(0)
    .borderRadius(0)
    .backgroundColor(this.bg())
    .border(proteusBtnBorder(this.pressed))
    .scale(this.pressed ? { x: 0.94, y: 0.94 } : { x: 1, y: 1 })
    .stateEffect(false)
    .onClick(() => this.onAction())
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
  }
}

@Component
export struct ProteusClassicBtn {
  @Prop label: ResourceStr = '';
  @Prop widthVal: string | number = 'auto';
  @Prop heightVal: number = ProteusDimens.PARAM_ROW_HEIGHT;
  @Prop tooltip: string = '';
  onAction: () => void = () => {};
  @State private tipVisible: boolean = false;
  @State private pressed: boolean = false;

  private tipText(): string {
    return this.tooltip;
  }

  build() {
    Button({ type: ButtonType.Normal }) {
      Text(this.label)
        .fontSize(ProteusFonts.BTN_LABEL)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Medium)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED : ProteusColors.BTN_BG)
    .borderRadius(0)
    .border(proteusBtnBorder(this.pressed))
    .height(this.heightVal)
    .width(this.widthVal)
    .padding({ left: 6, right: 6 })
    .scale(this.pressed ? { x: 0.97, y: 0.94 } : { x: 1, y: 1 })
    .stateEffect(false)
    .onClick(() => this.onAction())
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onHover((hover: boolean) => {
      if (this.tipText().length > 0) {
        this.tipVisible = hover;
      }
    })
    .bindPopup(this.tipVisible, {
      builder: this.tooltipPopup,
      placement: Placement.Top,
      enableArrow: true,
      popupColor: Color.Transparent,
      mask: false,
      onStateChange: (event) => {
        if (!event.isVisible) {
          this.tipVisible = false;
        }
      }
    })
  }

  @Builder
  tooltipPopup() {
    ProteusTooltipBubble(this.tipText())
  }
}

/** 面板内分段标题 */
@Component
export struct ProteusSectionTitle {
  @Prop title: string = '';

  build() {
    Text(this.title)
      .fontSize(ProteusFonts.TITLE)
      .fontColor(ProteusColors.TEXT_PRIMARY)
      .fontWeight(FontWeight.Medium)
      .width('100%')
      .padding({ left: 8, right: 8, top: 8, bottom: 4 })
  }
}

/** 仪器/面板子标签芯片 — 选中蓝底白字，支持等宽铺满一行 */
@Component
export struct ProteusChipTab {
  @Prop label: string = '';
  @Prop selected: boolean = false;
  @Prop fillWidth: boolean = false;
  onSelect: () => void = () => {};
  @State private pressed: boolean = false;

  private bg(): string {
    if (this.pressed) {
      return this.selected ? '#0055AA' : ProteusColors.BTN_PRESSED;
    }
    return this.selected ? ProteusColors.TAB_CHIP_ACTIVE_BG : ProteusColors.TAB_CHIP_IDLE_BG;
  }

  build() {
    Column() {
      Text(this.label)
        .fontSize(ProteusFonts.TAB_CHIP)
        .fontColor(this.selected ? ProteusColors.TAB_CHIP_ACTIVE_TEXT : ProteusColors.TAB_CHIP_IDLE_TEXT)
        .fontWeight(this.selected ? FontWeight.Bold : FontWeight.Medium)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textAlign(TextAlign.Center)
        .width('100%')
    }
    .width(this.fillWidth ? '100%' : 'auto')
    .layoutWeight(this.fillWidth ? 1 : 0)
    .height(ProteusDimens.TAB_CHIP_HEIGHT)
    .padding({ left: 4, right: 4 })
    .justifyContent(FlexAlign.Center)
    .backgroundColor(this.bg())
    .border({
      width: this.selected ? { left: 3, top: 1, right: 1, bottom: 1 } : 1,
      color: this.selected ? ProteusColors.SELECTED : ProteusColors.TAB_CHIP_BORDER
    })
    .scale(this.pressed ? { x: 0.96, y: 0.92 } : { x: 1, y: 1 })
    .onClick(() => this.onSelect())
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
  }
}

/** 芯片按钮网格 — 按列数自动换行向下排列，无需横向滑动 */
@Component
export struct ProteusChipGrid {
  @Prop labels: string[] = [];
  @Prop selectedIdx: number = -1;
  @Prop colsPerRow: number = 3;
  onSelect: (idx: number) => void = (_idx: number) => {};

  private rowStarts(): number[] {
    const starts: number[] = [];
    for (let i = 0; i < this.labels.length; i += this.colsPerRow) {
      starts.push(i);
    }
    return starts;
  }

  private rowLabels(start: number): string[] {
    const end = Math.min(start + this.colsPerRow, this.labels.length);
    const slice: string[] = [];
    for (let i = start; i < end; i++) {
      slice.push(this.labels[i]);
    }
    return slice;
  }

  build() {
    Column({ space: 4 }) {
      ForEach(this.rowStarts(), (start: number) => {
        Row({ space: 4 }) {
          ForEach(this.rowLabels(start), (label: string, offset: number) => {
            ProteusChipTab({
              label: label,
              selected: this.selectedIdx === start + offset,
              fillWidth: true,
              onSelect: () => { this.onSelect(start + offset); }
            })
          }, (label: string, offset: number) => `chip_${start}_${offset}_${label}`)
        }
        .width('100%')
      }, (start: number) => `chip_row_${start}`)
    }
    .width('100%')
  }
}

@Component
export struct ProteusMenuItem {
  @Prop label: ResourceStr = '';
  @State pressed: boolean = false;
  @State hovered: boolean = false;
  onAction: () => void = () => {};

  build() {
    Button(this.label)
      .fontSize(ProteusFonts.MENU)
      .fontColor(ProteusColors.TEXT_PRIMARY)
      .height(ProteusDimens.MENU_HEIGHT)
      .padding({ left: 6, right: 6 })
      .borderRadius(0)
      .backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
        (this.hovered ? '#E8E8E8' : ProteusColors.MENU_BG))
      .scale(this.pressed ? { x: 0.98, y: 0.92 } : { x: 1, y: 1 })
      .stateEffect(false)
      .onClick(() => this.onAction())
      .onHover((isHover: boolean) => { this.hovered = isHover; })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) { this.pressed = true; }
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.pressed = false; }
      })
  }
}

@Component
export struct ProteusNavTab {
  @Prop label: ResourceStr = '';
  @Prop selected: boolean = false;
  onSelect: () => void = () => {};
  @State private pressed: boolean = false;

  private bg(): string {
    if (this.pressed) {
      return this.selected ? '#0055AA' : ProteusColors.BTN_PRESSED;
    }
    return this.selected ? ProteusColors.TAB_CHIP_ACTIVE_BG : ProteusColors.TAB_CHIP_IDLE_BG;
  }

  build() {
    Text(this.label)
      .fontSize(ProteusFonts.TAB_CHIP)
      .fontColor(this.selected ? ProteusColors.TAB_CHIP_ACTIVE_TEXT : ProteusColors.TAB_CHIP_IDLE_TEXT)
      .fontWeight(this.selected ? FontWeight.Bold : FontWeight.Medium)
      .maxLines(1)
      .textOverflow({ overflow: TextOverflow.Ellipsis })
      .textAlign(TextAlign.Center)
      .layoutWeight(1)
      .height(ProteusDimens.TAB_BAR_HEIGHT)
      .backgroundColor(this.bg())
      .border({
        width: { bottom: this.selected ? 2 : 1 },
        color: this.selected ? ProteusColors.BTN_FOCUS : ProteusColors.TAB_CHIP_BORDER
      })
      .scale(this.pressed ? { x: 0.98, y: 0.92 } : { x: 1, y: 1 })
      .onClick(() => this.onSelect())
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) {
          this.pressed = true;
        } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.pressed = false;
        }
      })
  }
}

@Component
export struct ProteusCollapsibleSection {
  @Prop title: ResourceStr = '';
  @Link expanded: boolean;
  @BuilderParam content: () => void;

  build() {
    Column() {
      ProteusPanelTitle({
        title: this.title,
        collapsed: !this.expanded,
        onToggle: () => { this.expanded = !this.expanded; }
      })
      if (this.expanded) {
        Column() {
          this.content()
        }
        .width('100%')
        .backgroundColor(ProteusColors.CANVAS_BG)
        .border({ width: { left: 1, right: 1, bottom: 1 }, color: ProteusColors.DIVIDER })
      }
    }
    .width('100%')
  }
}

@Component
export struct ProteusTreeRow {
  @Prop label: ResourceStr = '';
  @Prop depth: number = 0;
  @Prop selected: boolean = false;
  @Prop expandable: boolean = false;
  @Prop expanded: boolean = false;
  @State hovered: boolean = false;
  @State private pressed: boolean = false;
  onClickRow: () => void = () => {};
  onDoubleClick: () => void = () => {};
  onToggleExpand: () => void = () => {};

  private bg(): ResourceColor {
    if (this.pressed) {
      return ProteusColors.BTN_PRESSED;
    }
    if (this.selected) {
      return ProteusColors.TREE_SELECTED;
    }
    return this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent;
  }

  build() {
    Row() {
      Blank().width(this.depth * 12)
      if (this.expandable) {
        Text(this.expanded ? '▾' : '▸')
          .fontSize(10)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .width(14)
          .height(14)
          .textAlign(TextAlign.Center)
          .onClick(() => this.onToggleExpand())
      } else {
        Blank().width(14)
      }
      Text(this.label)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(this.selected ? FontWeight.Medium : FontWeight.Normal)
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textAlign(TextAlign.Start)
    }
    .width('100%')
    .height(ProteusDimens.TREE_ROW_HEIGHT)
    .padding({ left: 4, right: 4 })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.bg())
    .scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 })
    .onHover((isHover: boolean) => { this.hovered = isHover; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onClickRow())
    .gesture(
      TapGesture({ count: 2 })
        .onAction(() => this.onDoubleClick())
    )
  }
}

@Component
export struct ProteusParamRow {
  @Prop label: ResourceStr = '';
  @Prop value: string = '';
  @Prop editable: boolean = false;
  onChange: (v: string) => void = () => {};

  build() {
    Row() {
      Text(this.label)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .width(ProteusDimens.PARAM_LABEL_WIDTH)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (this.editable) {
        TextInput({ text: this.value })
          .layoutWeight(1)
          .height(ProteusDimens.PARAM_ROW_HEIGHT)
          .fontSize(ProteusFonts.PARAM_VALUE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .backgroundColor(ProteusColors.CANVAS_BG)
          .borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .padding({ left: 4, right: 4 })
          .onChange((v: string) => this.onChange(v))
      } else {
        Text(this.value)
          .layoutWeight(1)
          .fontSize(ProteusFonts.PARAM_VALUE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .height(ProteusDimens.PARAM_ROW_HEIGHT)
          .backgroundColor(ProteusColors.INPUT_READONLY_BG)
          .border({ width: 1, color: ProteusColors.DIVIDER })
          .padding({ left: 4, right: 4 })
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
    }
    .width('100%')
    .margin({ bottom: ProteusDimens.PARAM_GAP })
    .alignItems(VerticalAlign.Center)
  }
}

/**
 * 图标+标签工具按钮 — 用于工具栏，支持 active 高亮、tooltip、可选纯图标
 */
@Component
export struct ProteusToolButton {
  @Prop iconName: ProteusIconName = ProteusIconName.SEARCH;
  @Prop label: ResourceStr = '';
  @Prop showLabel: boolean = true;
  @Prop active: boolean = false;
  @Prop disabled: boolean = false;
  @Prop tooltip: string = '';
  @Prop btnSize: number = 24;
  onAction: () => void = () => {};
  @State private tipVisible: boolean = false;
  @State private pressed: boolean = false;

  private bg(): string {
    if (this.disabled) {
      return ProteusColors.INPUT_READONLY_BG;
    }
    if (this.pressed) {
      return ProteusColors.BTN_PRESSED;
    }
    return this.active ? ProteusColors.TREE_SELECTED : ProteusColors.BTN_BG;
  }

  build() {
    Button({ type: ButtonType.Normal }) {
      Row() {
        ProteusIcon({
          name: this.iconName,
          iconSize: 14,
          color: this.disabled ? ProteusColors.TEXT_SECONDARY :
            (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY)
        })
        if (this.showLabel && this.label !== '') {
          Text(this.label)
            .fontSize(ProteusFonts.TOOLBAR)
            .fontColor(this.disabled ? ProteusColors.TEXT_SECONDARY :
              (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY))
            .fontWeight(this.active ? FontWeight.Medium : FontWeight.Normal)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .margin({ left: 3 })
        }
      }
      .justifyContent(FlexAlign.Center)
    }
    .height(this.btnSize)
    .constraintSize({ minWidth: this.showLabel ? 0 : this.btnSize, maxWidth: this.showLabel ? 220 : this.btnSize })
    .padding({ left: 3, right: 3 })
    .borderRadius(0)
    .backgroundColor(this.bg())
    .border(this.disabled ? { width: 1, color: ProteusColors.INPUT_BORDER } :
      proteusBtnBorder(this.pressed || this.active))
    .scale((this.pressed && !this.disabled) ? { x: 0.94, y: 0.94 } : { x: 1, y: 1 })
    .enabled(!this.disabled)
    .stateEffect(false)
    .onClick(() => { if (!this.disabled) this.onAction(); })
    .onTouch((event: TouchEvent) => {
      if (this.disabled) {
        return;
      }
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onHover((hover: boolean) => {
      if (!this.disabled && this.tooltip.length > 0) {
        this.tipVisible = hover;
      }
    })
    .bindPopup(this.tipVisible, {
      builder: this.tooltipPopup,
      placement: Placement.Top,
      enableArrow: true,
      popupColor: Color.Transparent,
      mask: false,
      onStateChange: (event) => {
        if (!event.isVisible) {
          this.tipVisible = false;
        }
      }
    })
  }

  @Builder
  tooltipPopup() {
    ProteusTooltipBubble(this.tooltip)
  }
}

/**
 * 菜单触发按钮 — 点击展开下拉菜单。使用 ArkUI bindMenu + CustomBuilder。
 */
@Component
export struct ProteusMenuTrigger {
  @Prop label: ResourceStr = '';
  entries: ProteusMenuEntry[] = [];
  @State open: boolean = false;
  @State private pressed: boolean = false;

  build() {
    Button({ type: ButtonType.Normal }) {
      Row() {
        Text(this.label)
          .fontSize(ProteusFonts.MENU)
          .fontColor(ProteusColors.TEXT_PRIMARY)
        ProteusIcon({ name: ProteusIconName.CHEVRON_DOWN, iconSize: 8, color: ProteusColors.TEXT_SECONDARY })
          .margin({ left: 2 })
      }
    }
    .height(ProteusDimens.MENU_HEIGHT)
    .padding({ left: 6, right: 4 })
    .borderRadius(0)
    .backgroundColor(this.pressed || this.open ? ProteusColors.BTN_PRESSED : ProteusColors.MENU_BG)
    .border(proteusBtnBorder(this.pressed || this.open))
    .scale(this.pressed ? { x: 0.98, y: 0.92 } : { x: 1, y: 1 })
    .stateEffect(false)
    .onClick(() => { this.open = true; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .bindMenu(this.buildMenu)
  }

  @Builder
  buildMenu() {
    Column() {
      ForEach(this.entries, (e: ProteusMenuEntry, idx: number) => {
        if (e.separator) {
          Divider().color(ProteusColors.DIVIDER).height(1).width('100%')
        } else {
          ProteusMenuEntryRow({
            label: e.label,
            shortcut: e.shortcut ?? '',
            disabled: e.disabled === true,
            onAction: () => {
              this.open = false;
              e.action();
            }
          })
        }
      }, (e: ProteusMenuEntry, idx: number) => `${idx}_${e.shortcut ?? ''}`)
    }
    .width(220)
    .backgroundColor(ProteusColors.CANVAS_BG)
    .border({ width: 1, color: ProteusColors.WINDOW_BORDER })
  }
}

/** 下拉菜单行 — 独立组件以便有按下态 */
@Component
struct ProteusMenuEntryRow {
  @Prop label: ResourceStr = '';
  @Prop shortcut: string = '';
  @Prop disabled: boolean = false;
  onAction: () => void = () => {};
  @State private pressed: boolean = false;
  @State private hovered: boolean = false;

  build() {
    Row() {
      Blank().width(16)
      Text(this.label)
        .fontSize(ProteusFonts.MENU)
        .fontColor(this.disabled ? ProteusColors.TEXT_SECONDARY : ProteusColors.TEXT_PRIMARY)
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (this.shortcut.length > 0) {
        Text(this.shortcut)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ left: 12 })
      }
    }
    .width('100%')
    .height(24)
    .padding({ left: 8, right: 8 })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
      (this.hovered ? ProteusColors.MENU_HOVER : Color.Transparent))
    .scale(this.pressed ? { x: 0.99, y: 0.92 } : { x: 1, y: 1 })
    .enabled(!this.disabled)
    .onHover((h: boolean) => { this.hovered = h; })
    .onTouch((event: TouchEvent) => {
      if (this.disabled) {
        return;
      }
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => {
      if (!this.disabled) {
        this.onAction();
      }
    })
  }
}

/**
 * 右侧边栏图标标签 — 悬停显示完整名称
 */
@Component
export struct ProteusSidebarTab {
  @Prop label: string = '';
  @Prop tooltip: string = '';
  @Prop icon: ProteusIconName = ProteusIconName.SETTINGS;
  @Prop selected: boolean = false;
  onSelect: () => void = () => {};
  @State private tipVisible: boolean = false;
  @State private pressed: boolean = false;

  private tipText(): string {
    return this.tooltip.length > 0 ? this.tooltip : this.label;
  }

  private bg(): string {
    if (this.pressed) {
      return this.selected ? '#E8E8E8' : '#909090';
    }
    return this.selected ?
      ProteusColors.SIDEBAR_TAB_ACTIVE_BG : ProteusColors.SIDEBAR_TAB_IDLE_BG;
  }

  build() {
    Column() {
      ProteusIcon({
        name: this.icon,
        iconSize: 16,
        color: this.selected ?
          ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
      })
      Text(this.label)
        .fontSize(9)
        .fontColor(this.selected ?
          ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT)
        .fontWeight(this.selected ? FontWeight.Bold : FontWeight.Medium)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: 2 })
    }
    .width(44)
    .height(50)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .backgroundColor(this.bg())
    .border({
      width: {
        left: this.selected ? 3 : 0,
        bottom: 1
      },
      color: this.selected ?
        ProteusColors.BTN_FOCUS : ProteusColors.SIDEBAR_TAB_BORDER
    })
    .scale(this.pressed ? { x: 0.94, y: 0.94 } : { x: 1, y: 1 })
    .onClick(() => { this.onSelect(); })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onHover((hover: boolean) => {
      if (this.tipText().length > 0) {
        this.tipVisible = hover;
      }
    })
    .bindPopup(this.tipVisible, {
      builder: this.tooltipPopup,
      placement: Placement.Left,
      enableArrow: true,
      popupColor: Color.Transparent,
      mask: false,
      onStateChange: (event) => {
        if (!event.isVisible) {
          this.tipVisible = false;
        }
      }
    })
  }

  @Builder
  tooltipPopup() {
    ProteusTooltipBubble(this.tipText())
  }
}

/**
 * 工具栏分组标签 — 小标题 + 分隔线
 */
@Component
export struct ProteusToolGroup {
  @Prop title: string = '';
  @BuilderParam content: () => void;

  build() {
    Row() {
      Text(this.title)
        .fontSize(9)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .height(ProteusDimens.TOOLBAR_HEIGHT)
        .align(Alignment.Center)
        .margin({ left: 4, right: 2 })
      this.content()
      Column()
        .width(1)
        .height(ProteusDimens.TOOLBAR_HEIGHT - 8)
        .backgroundColor(ProteusColors.DIVIDER)
        .margin({ left: 4, right: 4 })
    }
    .alignItems(VerticalAlign.Center)
  }
}

/**
 * 面板分隔条 — 拖动调整面板宽度
 */
@Component
export struct ProteusResizer {
  @Prop side: 'left' | 'right' = 'right';
  onDrag: (delta: number) => void = () => {};
  @State hovered: boolean = false;
  @State private tipVisible: boolean = false;
  private startOffset: number = 0;
  private lastOffset: number = 0;

  build() {
    Column()
      .width(4)
      .height('100%')
      .backgroundColor(this.hovered ? ProteusColors.BTN_FOCUS : ProteusColors.DIVIDER)
      .onHover((h: boolean) => {
        this.hovered = h;
        this.tipVisible = h;
      })
      .bindPopup(this.tipVisible, {
        builder: this.resizerTip,
        placement: this.side === 'right' ? Placement.Left : Placement.Right,
        enableArrow: true,
        popupColor: Color.Transparent,
        mask: false,
        onStateChange: (event) => {
          if (!event.isVisible) {
            this.tipVisible = false;
          }
        }
      })
      .gesture(
        PanGesture()
          .onActionStart((e: GestureEvent) => {
            this.startOffset = e.offsetX;
            this.lastOffset = e.offsetX;
          })
          .onActionUpdate((e: GestureEvent) => {
            const delta = e.offsetX - this.lastOffset;
            this.lastOffset = e.offsetX;
            const dx = this.side === 'right' ? -delta : delta;
            this.onDrag(dx);
          })
      )
      .hitTestBehavior(HitTestMode.Block)
  }

  @Builder
  resizerTip() {
    ProteusTooltipBubble('拖动调整面板宽度')
  }
}

/**
 * 通用可点击行 — 导航列表 / 设置项等，统一按下变暗 + 微缩
 */
@Component
export struct ProteusPressRow {
  @Prop selected: boolean = false;
  @Prop heightVal: number = ProteusDimens.NAV_ROW_HEIGHT;
  @Prop showDivider: boolean = true;
  @Prop padLeft: number = 6;
  @Prop padRight: number = 4;
  onAction: () => void = () => {};
  @BuilderParam content: () => void;
  @State private pressed: boolean = false;
  @State private hovered: boolean = false;

  private bg(): ResourceColor {
    if (this.pressed) {
      return ProteusColors.BTN_PRESSED;
    }
    if (this.selected) {
      return ProteusColors.TREE_SELECTED;
    }
    return this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent;
  }

  build() {
    Row() {
      this.content()
    }
    .width('100%')
    .height(this.heightVal)
    .padding({ left: this.padLeft, right: this.padRight })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.bg())
    .border(this.showDivider ? { width: { bottom: 0.5 }, color: ProteusColors.DIVIDER } :
      { width: 0, color: Color.Transparent })
    .scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 })
    .onHover((h: boolean) => { this.hovered = h; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onAction())
  }
}

/** 器件导航行：refDes + libraryId */
@Component
export struct ProteusNavCompRow {
  @Prop refDes: string = '';
  @Prop libraryId: string = '';
  @Prop selected: boolean = false;
  onAction: () => void = () => {};
  @State private pressed: boolean = false;
  @State private hovered: boolean = false;

  private bg(): ResourceColor {
    if (this.pressed) {
      return ProteusColors.BTN_PRESSED;
    }
    if (this.selected) {
      return ProteusColors.TREE_SELECTED;
    }
    return this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent;
  }

  build() {
    Row() {
      Text(this.refDes)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(this.selected ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Medium)
        .width(60)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(this.libraryId)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(ProteusDimens.NAV_ROW_HEIGHT)
    .padding({ left: 6, right: 4 })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.bg())
    .border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER })
    .scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 })
    .onHover((h: boolean) => { this.hovered = h; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onAction())
  }
}

/** 网络列表行 */
@Component
export struct ProteusNavNetRow {
  @Prop label: string = '';
  onAction: () => void = () => {};
  @State private pressed: boolean = false;
  @State private hovered: boolean = false;

  build() {
    Row() {
      Text(this.label)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.WIRE)
        .fontWeight(FontWeight.Medium)
        .maxLines(1)
    }
    .width('100%')
    .height(ProteusDimens.NAV_ROW_HEIGHT + 2)
    .padding({ left: 8, right: 4 })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
      (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent))
    .border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER })
    .scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 })
    .onHover((h: boolean) => { this.hovered = h; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onAction())
  }
}

/** ERC 错误列表行 */
@Component
export struct ProteusErcRow {
  @Prop mark: string = '⚠';
  @Prop markColor: string = ProteusColors.ERC_WARN;
  @Prop desc: string = '';
  onAction: () => void = () => {};
  @State private pressed: boolean = false;
  @State private hovered: boolean = false;

  build() {
    Row() {
      Text(this.mark)
        .fontSize(10)
        .fontColor(this.markColor)
        .width(16)
      Text(this.desc)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(this.markColor)
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(ProteusDimens.NAV_ROW_HEIGHT)
    .padding({ left: 6, right: 4 })
    .alignItems(VerticalAlign.Center)
    .backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
      (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent))
    .border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER })
    .scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 })
    .onHover((h: boolean) => { this.hovered = h; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onAction())
  }
}

/** 键值设置行：左侧强调色键名 + 描述 */
@Component
export struct ProteusKeyDescRow {
  @Prop keyLabel: string = '';
  @Prop description: string = '';
  @Prop keyWidth: number = 72;
  onAction: () => void = () => {};
  @State private pressed: boolean = false;
  @State private hovered: boolean = false;

  build() {
    Row() {
      Text(this.keyLabel)
        .fontSize(10)
        .fontColor(ProteusColors.DIGITAL)
        .width(this.keyWidth)
      Text(this.description)
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .layoutWeight(1)
    }
    .width('100%')
    .padding({ left: 12, right: 8, top: 4, bottom: 4 })
    .backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
      (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent))
    .scale(this.pressed ? { x: 0.99, y: 0.94 } : { x: 1, y: 1 })
    .onHover((h: boolean) => { this.hovered = h; })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onAction())
  }
}
