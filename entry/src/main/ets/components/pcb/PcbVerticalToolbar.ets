/**
 * KiCad 风格左侧垂直工具栏 — 纯图标 + tooltip
 */
import { PcbToolMode } from 'pcb_editor';
import { ProteusColors, ProteusDimens } from '../../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../../theme/ThemeManager';
import { ProteusIcon, ProteusIconName } from '../proteus/ProteusIcons';
import { ProteusTooltipBubble } from '../proteus/ProteusWidgets';

@Component
export struct PcbVerticalToolbar {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop toolMode: PcbToolMode = PcbToolMode.SELECT;
  @Prop gridActive: boolean = true;
  onToolSelect: (mode: PcbToolMode) => void = (_m: PcbToolMode) => {};
  onRotate: () => void = () => {};
  onDelete: () => void = () => {};
  onUndo: () => void = () => {};
  onRedo: () => void = () => {};
  onFit: () => void = () => {};
  onToggleGrid: () => void = () => {};
  onUpdatePcb: () => void = () => {};
  onDrc: () => void = () => {};
  onAutoRoute: () => void = () => {};

  build() {
    Column() {
      this.toolBtn(ProteusIconName.SELECT, '选择 (S)', this.toolMode === PcbToolMode.SELECT, () => {
        this.onToolSelect(PcbToolMode.SELECT);
      })
      this.toolBtn(ProteusIconName.TRACK, '走线 (X)', this.toolMode === PcbToolMode.ROUTE, () => {
        this.onToolSelect(PcbToolMode.ROUTE);
      })
      this.toolBtn(ProteusIconName.VIA, '过孔 (V)', this.toolMode === PcbToolMode.VIA, () => {
        this.onToolSelect(PcbToolMode.VIA);
      })
      this.toolBtn(ProteusIconName.ZONE, '覆铜 (Z)', this.toolMode === PcbToolMode.POUR, () => {
        this.onToolSelect(PcbToolMode.POUR);
      })

      Divider().color(ProteusColors.DIVIDER).width('80%').margin({ top: 4, bottom: 4 })

      this.toolBtn(ProteusIconName.ROTATE, '旋转 (R)', false, () => { this.onRotate(); })
      this.toolBtn(ProteusIconName.TRASH, '删除 (Del)', false, () => { this.onDelete(); })
      this.toolBtn(ProteusIconName.UNDO, '撤销 (Ctrl+Z)', false, () => { this.onUndo(); })
      this.toolBtn(ProteusIconName.REDO, '重做 (Ctrl+Y)', false, () => { this.onRedo(); })

      Divider().color(ProteusColors.DIVIDER).width('80%').margin({ top: 4, bottom: 4 })

      this.toolBtn(ProteusIconName.FIT, '适应窗口 (F)', false, () => { this.onFit(); })
      this.toolBtn(ProteusIconName.GRID, '切换网格', this.gridActive, () => { this.onToggleGrid(); })

      Blank()

      this.toolBtn(ProteusIconName.COMPONENT, '更新 PCB', false, () => { this.onUpdatePcb(); })
      this.toolBtn(ProteusIconName.DRC, 'DRC 检查', false, () => { this.onDrc(); })
      this.toolBtn(ProteusIconName.AI_ROUTE, '自动布线', false, () => { this.onAutoRoute(); })
    }
    .width(44)
    .height('100%')
    .padding({ top: 4, bottom: 4 })
    .backgroundColor(ProteusColors.TOOLBAR_BG)
    .border({ width: { right: 1 }, color: ProteusColors.BORDER })
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  toolBtn(icon: ProteusIconName, tip: string, active: boolean, action: () => void) {
    PcbToolIconBtn({ icon: icon, tip: tip, active: active, onAction: action })
  }
}

@Component
struct PcbToolIconBtn {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop icon: ProteusIconName = ProteusIconName.SELECT;
  @Prop tip: string = '';
  @Prop active: boolean = false;
  onAction: () => void = () => {};
  @State private tipVisible: boolean = false;
  @State private pressed: boolean = false;

  private bg(): string {
    if (this.pressed) {
      return ProteusColors.BTN_PRESSED;
    }
    return this.active ? ProteusColors.TOOL_ACTIVE : '#00000000';
  }

  build() {
    Column() {
      ProteusIcon({
        name: this.icon,
        iconSize: ProteusDimens.ICON_SIZE,
        color: this.active ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY
      })
    }
    .width(36)
    .height(36)
    .justifyContent(FlexAlign.Center)
    .backgroundColor(this.bg())
    .border({
      width: this.active ? 1 : 0,
      color: this.active ? ProteusColors.SELECTED : Color.Transparent
    })
    .margin({ bottom: 2 })
    .onClick(() => { this.onAction(); })
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
      builder: this.tooltipPopup,
      placement: Placement.Right,
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
    ProteusTooltipBubble(this.tip)
  }
}
