/**
 * 主工具栏 — 从 Index 拆分
 */
import { ProteusClassicBtn, ProteusVDivider } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens } from '../theme/ProteusTheme';
import { ThemeManager } from '../theme/ThemeManager';

@Component
export struct AppToolbar {
  @Prop simRunning: boolean = false;
  onNew: () => void = () => {};
  onOpen: () => void = () => {};
  onSave: () => void = () => {};
  onUndo: () => void = () => {};
  onRedo: () => void = () => {};
  onCut: () => void = () => {};
  onCopy: () => void = () => {};
  onPaste: () => void = () => {};
  onZoomIn: () => void = () => {};
  onZoomOut: () => void = () => {};
  onFit: () => void = () => {};
  onToggleGrid: () => void = () => {};
  onPlace: () => void = () => {};
  onWire: () => void = () => {};
  onToggleWar: () => void = () => {};
  onBus: () => void = () => {};
  onLabel: () => void = () => {};
  onPower: () => void = () => {};
  onGround: () => void = () => {};
  onAlignLeft: () => void = () => {};
  onAlignRight: () => void = () => {};
  onAlignTop: () => void = () => {};
  onDistribute: () => void = () => {};
  onRotate: () => void = () => {};
  onMirror: () => void = () => {};
  onSimToggle: () => void = () => {};
  onSimPause: () => void = () => {};
  onSimStop: () => void = () => {};
  onErc: () => void = () => {};
  onAiRoute: () => void = () => {};
  onAiLayout: () => void = () => {};
  onAiDiag: () => void = () => {};

  build() {
    Scroll() {
      Row() {
        ProteusClassicBtn({ label: $r('app.string.toolbar_new'), widthVal: 40, onAction: () => this.onNew() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_open'), widthVal: 40, onAction: () => this.onOpen() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_save'), widthVal: 40, onAction: () => this.onSave() })
        ProteusVDivider()
        ProteusClassicBtn({ label: $r('app.string.toolbar_undo'), widthVal: 52, onAction: () => this.onUndo() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_redo'), widthVal: 52, onAction: () => this.onRedo() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_cut'), widthVal: 48, onAction: () => this.onCut() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_copy'), widthVal: 48, onAction: () => this.onCopy() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_paste'), widthVal: 48, onAction: () => this.onPaste() })
        ProteusVDivider()
        ProteusClassicBtn({ label: $r('app.string.toolbar_zoom_in'), widthVal: 48, onAction: () => this.onZoomIn() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_zoom_out'), widthVal: 48, onAction: () => this.onZoomOut() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_fit'), widthVal: 48, onAction: () => this.onFit() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_grid'), widthVal: 48, onAction: () => this.onToggleGrid() })
        ProteusVDivider()
        ProteusClassicBtn({ label: $r('app.string.toolbar_place'), widthVal: 48, onAction: () => this.onPlace() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_wire'), widthVal: 48, onAction: () => this.onWire() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_war'), widthVal: 44, onAction: () => this.onToggleWar() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_bus'), widthVal: 48, onAction: () => this.onBus() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_label'), widthVal: 48, onAction: () => this.onLabel() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_power'), widthVal: 48, onAction: () => this.onPower() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_ground'), widthVal: 52, onAction: () => this.onGround() })
        ProteusVDivider()
        ProteusClassicBtn({ label: $r('app.string.toolbar_align_left'), widthVal: 48, onAction: () => this.onAlignLeft() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_align_right'), widthVal: 48, onAction: () => this.onAlignRight() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_align_top'), widthVal: 48, onAction: () => this.onAlignTop() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_distribute'), widthVal: 48, onAction: () => this.onDistribute() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_rotate'), widthVal: 48, onAction: () => this.onRotate() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_mirror'), widthVal: 48, onAction: () => this.onMirror() })
        ProteusVDivider()
        ProteusClassicBtn({
          label: this.simRunning ? $r('app.string.toolbar_sim_stop') : $r('app.string.toolbar_sim_start'),
          widthVal: 52,
          onAction: () => this.onSimToggle()
        })
        ProteusClassicBtn({ label: $r('app.string.toolbar_sim_pause'), widthVal: 48, onAction: () => this.onSimPause() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_sim_stop'), widthVal: 48, onAction: () => this.onSimStop() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_erc'), widthVal: 36, onAction: () => this.onErc() })
        ProteusVDivider()
        ProteusClassicBtn({ label: $r('app.string.toolbar_ai_route'), widthVal: 52, onAction: () => this.onAiRoute() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_ai_layout'), widthVal: 52, onAction: () => this.onAiLayout() })
        ProteusClassicBtn({ label: $r('app.string.toolbar_ai_diag'), widthVal: 52, onAction: () => this.onAiDiag() })
      }
      .padding({ left: 4, right: 4 })
      .alignItems(VerticalAlign.Center)
    }
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
    .width('100%')
    .height(ProteusDimens.TOOLBAR_HEIGHT)
    .backgroundColor(ThemeManager.getInstance().toolbarBg())
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
  }
}
