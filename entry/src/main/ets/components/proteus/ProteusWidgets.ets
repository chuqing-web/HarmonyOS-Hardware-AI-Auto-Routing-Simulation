/**
 * Proteus 风格可复用 UI 组件 — 使用 Button 确保 2in1/鼠标点击可靠
 */
import { ProteusColors, ProteusDimens, ProteusFonts } from '../../theme/ProteusTheme';
import { ProteusIcon, ProteusIconName } from './ProteusIcons';

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
  onToggle: () => void = () => {};

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
    .backgroundColor(ProteusColors.PANEL_TITLE_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
    .alignItems(VerticalAlign.Center)
    .onClick(() => this.onToggle())
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
    .backgroundColor(this.active ? ProteusColors.TREE_SELECTED : ProteusColors.BTN_BG)
    .border({ width: 1, color: ProteusColors.DIVIDER })
    .onClick(() => this.onAction())
  }
}

@Component
export struct ProteusClassicBtn {
  @Prop label: ResourceStr = '';
  @Prop widthVal: string | number = 'auto';
  onAction: () => void = () => {};

  build() {
    Button({ type: ButtonType.Normal }) {
      Text(this.label)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .backgroundColor(ProteusColors.BTN_BG)
    .borderRadius(0)
    .border({ width: 1, color: ProteusColors.INPUT_BORDER })
    .height(ProteusDimens.PARAM_ROW_HEIGHT)
    .width(this.widthVal)
    .padding({ left: 3, right: 3 })
    .onClick(() => this.onAction())
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
      .backgroundColor(this.pressed ? ProteusColors.MENU_HOVER :
        (this.hovered ? '#E8E8E8' : ProteusColors.MENU_BG))
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

  build() {
    Button({ type: ButtonType.Normal }) {
      Text(this.label)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(this.selected ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY)
        .fontWeight(this.selected ? FontWeight.Medium : FontWeight.Normal)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .layoutWeight(1)
    .height(ProteusDimens.PANEL_TITLE_HEIGHT)
    .padding(0)
    .borderRadius(0)
    .backgroundColor(this.selected ? ProteusColors.CANVAS_BG : '#E0E0E0')
    .border({ width: { bottom: this.selected ? 2 : 1 }, color: this.selected ? ProteusColors.SELECTED : ProteusColors.DIVIDER })
    .onClick(() => this.onSelect())
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
  onClickRow: () => void = () => {};
  onDoubleClick: () => void = () => {};
  onToggleExpand: () => void = () => {};

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
    .backgroundColor(this.selected ? ProteusColors.TREE_SELECTED :
      (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent))
    .onHover((isHover: boolean) => { this.hovered = isHover; })
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
        .width(80)
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
    .backgroundColor(this.active ? ProteusColors.TREE_SELECTED :
      (this.disabled ? ProteusColors.INPUT_READONLY_BG : ProteusColors.BTN_BG))
    .border({ width: 1, color: this.active ? ProteusColors.BTN_FOCUS : ProteusColors.INPUT_BORDER })
    .enabled(!this.disabled)
    .onClick(() => { if (!this.disabled) this.onAction(); })
    // .tooltip removed — not available on ButtonAttribute in current SDK
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
    .backgroundColor(this.open ? ProteusColors.MENU_HOVER : ProteusColors.MENU_BG)
    .onClick(() => { this.open = true; })
    .bindMenu(this.buildMenu)
  }

  @Builder
  buildMenu() {
    Column() {
      ForEach(this.entries, (e: ProteusMenuEntry, idx: number) => {
        if (e.separator) {
          Divider().color(ProteusColors.DIVIDER).height(1).width('100%')
        } else {
          Row() {
            Blank().width(16)
            Text(e.label)
              .fontSize(ProteusFonts.MENU)
              .fontColor(e.disabled ? ProteusColors.TEXT_SECONDARY : ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            if (e.shortcut && e.shortcut.length > 0) {
              Text(e.shortcut)
                .fontSize(ProteusFonts.STATUS)
                .fontColor(ProteusColors.TEXT_SECONDARY)
                .margin({ left: 12 })
            }
          }
          .width('100%')
          .height(24)
          .padding({ left: 8, right: 8 })
          .alignItems(VerticalAlign.Center)
          .enabled(!e.disabled)
          .onClick(() => {
            if (!e.disabled) {
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
  private startOffset: number = 0;
  private lastOffset: number = 0;

  build() {
    Column()
      .width(4)
      .height('100%')
      .backgroundColor(this.hovered ? ProteusColors.BTN_FOCUS : ProteusColors.DIVIDER)
      .onHover((h: boolean) => { this.hovered = h; })
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
}
