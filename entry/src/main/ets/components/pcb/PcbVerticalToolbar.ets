/**
 * PCB 左侧快捷工具栏 — 对齐原理图 ProteusToolButton（Button 命中）
 */
import { PcbToolMode } from 'pcb_editor';
import { ProteusColors } from '../../theme/ProteusTheme';
import { PROTEUS_THEME_REV_KEY } from '../../theme/ThemeManager';
import { ProteusIconName } from '../proteus/ProteusIcons';
import { ProteusToolButton } from '../proteus/ProteusWidgets';

@Component
export struct PcbVerticalToolbar {
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @Prop toolMode: PcbToolMode = PcbToolMode.SELECT;
  @Prop gridActive: boolean = true;
  onToolSelect: (mode: PcbToolMode) => void = (_m: PcbToolMode) => {};
  onRotate: () => void = () => {};
  onFlip: () => void = () => {};
  onDelete: () => void = () => {};
  onUndo: () => void = () => {};
  onRedo: () => void = () => {};
  onFit: () => void = () => {};
  onToggleGrid: () => void = () => {};
  onUpdatePcb: () => void = () => {};
  onDrc: () => void = () => {};
  onAutoRoute: () => void = () => {};
  onAiRoute: () => void = () => {};
  onCopy: () => void = () => {};
  onPaste: () => void = () => {};

  build() {
    Scroll() {
      Column({ space: 2 }) {
        ProteusToolButton({
          iconName: ProteusIconName.SELECT,
          tooltip: '选择 (S)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.SELECT,
          onAction: () => { this.onToolSelect(PcbToolMode.SELECT); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.TRACK,
          tooltip: '走线 (X)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.ROUTE,
          onAction: () => { this.onToolSelect(PcbToolMode.ROUTE); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.VIA,
          tooltip: '过孔 (V)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.VIA,
          onAction: () => { this.onToolSelect(PcbToolMode.VIA); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.ZONE,
          tooltip: '多边形覆铜 (Z)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.ZONE_POLY,
          onAction: () => { this.onToolSelect(PcbToolMode.ZONE_POLY); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.GROUND,
          tooltip: '整板覆铜 (Shift+Z)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.POUR,
          onAction: () => { this.onToolSelect(PcbToolMode.POUR); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.LABEL,
          tooltip: '板框 (O)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.OUTLINE,
          onAction: () => { this.onToolSelect(PcbToolMode.OUTLINE); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.RULER,
          tooltip: '测量 (M)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.MEASURE,
          onAction: () => { this.onToolSelect(PcbToolMode.MEASURE); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.COMPONENT,
          tooltip: '放置封装 (P)',
          showLabel: false,
          btnSize: 32,
          active: this.toolMode === PcbToolMode.PLACE_FP,
          onAction: () => { this.onToolSelect(PcbToolMode.PLACE_FP); }
        })

        Divider().color(ProteusColors.DIVIDER).width('80%').margin({ top: 4, bottom: 4 })

        ProteusToolButton({
          iconName: ProteusIconName.ROTATE,
          tooltip: '旋转 (R)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onRotate(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.MIRROR,
          tooltip: '镜像翻转 (F)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onFlip(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.TRASH,
          tooltip: '删除 (Del)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onDelete(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.UNDO,
          tooltip: '撤销 (Ctrl+Z)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onUndo(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.REDO,
          tooltip: '重做 (Ctrl+Y)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onRedo(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.COPY,
          tooltip: '复制 (Ctrl+C)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onCopy(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.PASTE,
          tooltip: '粘贴 (Ctrl+V)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onPaste(); }
        })

        Divider().color(ProteusColors.DIVIDER).width('80%').margin({ top: 4, bottom: 4 })

        ProteusToolButton({
          iconName: ProteusIconName.FIT,
          tooltip: '适应窗口 (Ctrl+0)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onFit(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.GRID,
          tooltip: '切换网格 (G)',
          showLabel: false,
          btnSize: 32,
          active: this.gridActive,
          onAction: () => { this.onToggleGrid(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.AI_LAYOUT,
          tooltip: '更新 PCB (U)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onUpdatePcb(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.DRC,
          tooltip: 'DRC 检查 (F7)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onDrc(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.WIRE,
          tooltip: '自动布线 (F8)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onAutoRoute(); }
        })
        ProteusToolButton({
          iconName: ProteusIconName.AI_ROUTE,
          tooltip: 'AI 布线面板 (F9)',
          showLabel: false,
          btnSize: 32,
          onAction: () => { this.onAiRoute(); }
        })
      }
      .width('100%')
      .padding({ top: 4, bottom: 8 })
      .alignItems(HorizontalAlign.Center)
    }
    .width(44)
    .height('100%')
    .scrollBar(BarState.Auto)
    .backgroundColor(ProteusColors.TOOLBAR_BG)
    .border({ width: { right: 1 }, color: ProteusColors.BORDER })
    .hitTestBehavior(HitTestMode.Default)
  }
}
