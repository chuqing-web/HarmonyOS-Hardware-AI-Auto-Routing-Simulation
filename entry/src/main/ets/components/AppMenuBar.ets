/**
 * 主菜单栏 — 从 Index 拆分
 */
import { ProteusMenuItem } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { ThemeManager } from '../theme/ThemeManager';

@Component
export struct AppMenuBar {
  @Prop projectName: string = '';
  onFileSave: () => void = () => {};
  onEditUndo: () => void = () => {};
  onViewToggleGrid: () => void = () => {};
  onPlaceMode: () => void = () => {};
  onSimToggle: () => void = () => {};
  onShowLibrary: () => void = () => {};
  onOpenProject: () => void = () => {};
  onHelp: () => void = () => {};

  build() {
    Row() {
      ProteusMenuItem({ label: $r('app.string.menu_file'), onAction: () => this.onFileSave() })
      ProteusMenuItem({ label: $r('app.string.menu_edit'), onAction: () => this.onEditUndo() })
      ProteusMenuItem({ label: $r('app.string.menu_view'), onAction: () => this.onViewToggleGrid() })
      ProteusMenuItem({ label: $r('app.string.menu_place'), onAction: () => this.onPlaceMode() })
      ProteusMenuItem({ label: $r('app.string.menu_sim'), onAction: () => this.onSimToggle() })
      ProteusMenuItem({ label: $r('app.string.menu_library'), onAction: () => this.onShowLibrary() })
      ProteusMenuItem({ label: $r('app.string.menu_project'), onAction: () => this.onOpenProject() })
      ProteusMenuItem({ label: $r('app.string.menu_help'), onAction: () => this.onHelp() })
      Blank()
      Text(this.projectName)
        .fontSize(ProteusFonts.MENU)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .margin({ right: 8 })
    }
    .width('100%')
    .height(ProteusDimens.MENU_HEIGHT)
    .backgroundColor(ThemeManager.getInstance().menuBg())
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
    .alignItems(VerticalAlign.Center)
  }
}
