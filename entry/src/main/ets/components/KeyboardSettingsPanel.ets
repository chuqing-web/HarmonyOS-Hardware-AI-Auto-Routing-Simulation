/**
 * 快捷键列表面板（只读，展示 KeyboardShortcutManager 绑定）
 */
import { KeyboardShortcutManager, ShortcutBinding } from '../utils/KeyboardShortcutManager';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';
import { ProteusKeyDescRow } from './proteus/ProteusWidgets';

@Component
export struct KeyboardSettingsPanel {
  @State bindings: ShortcutBinding[] = [];

  aboutToAppear(): void {
    this.bindings = KeyboardShortcutManager.getInstance().getAllBindings();
  }

  private formatKey(b: ShortcutBinding): string {
    const parts: string[] = [];
    if (b.ctrl) {
      parts.push('Ctrl');
    }
    if (b.shift) {
      parts.push('Shift');
    }
    if (b.alt) {
      parts.push('Alt');
    }
    parts.push(b.key.length === 1 ? b.key.toUpperCase() : b.key);
    return parts.join('+');
  }

  build() {
    Column({ space: 2 }) {
      Text($r('app.string.shortcuts_title'))
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .margin({ left: 8, top: 4 })
      ForEach(this.bindings, (b: ShortcutBinding) => {
        ProteusKeyDescRow({
          keyLabel: this.formatKey(b),
          description: b.description,
          onAction: () => {
            const km = KeyboardShortcutManager.getInstance();
            const altKey = b.key === 'g' ? 'h' : 'g';
            if (km.rebindShortcut(b.key, b.ctrl ?? false, altKey, b.ctrl ?? false)) {
              this.bindings = km.getAllBindings();
            }
          }
        })
      }, (b: ShortcutBinding, idx: number) => `${b.key}_${idx}`)
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }
}
