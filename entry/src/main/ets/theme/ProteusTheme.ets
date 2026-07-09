/**
 * Proteus 8.16 像素级 UI 主题常量
 * 传统 EDA 工业界面 — 直角、无圆角、无阴影、无渐变
 */

export class ProteusColors {
  // 全局背景
  static readonly MENU_BG: string = '#F0F0F0';
  static readonly TOOLBAR_BG: string = '#F6F6F6';
  static readonly PANEL_TITLE_BG: string = '#E8E8E8';
  static readonly STATUS_BAR_BG: string = '#F0F0F0';
  static readonly CANVAS_BG: string = '#FFFFFF';
  static readonly PREVIEW_BG: string = '#F2F2F2';
  static readonly INPUT_READONLY_BG: string = '#F0F0F0';

  // 交互态
  static readonly MENU_HOVER: string = '#D0D0D0';
  static readonly TOOL_HOVER: string = '#E0E0E0';
  static readonly TOOL_ACTIVE: string = '#C8C8C8';
  static readonly TREE_HOVER: string = '#E5F3FF';
  static readonly TREE_SELECTED: string = '#C0E0FF';

  // 边框/分割线
  static readonly BORDER: string = '#BBBBBB';
  static readonly DIVIDER: string = '#CCCCCC';
  static readonly INPUT_BORDER: string = '#AAAAAA';
  static readonly INPUT_FOCUS: string = '#666666';
  static readonly WINDOW_BORDER: string = '#888888';

  // 文字
  static readonly TEXT_PRIMARY: string = '#000000';
  static readonly TEXT_LABEL: string = '#444444';
  static readonly TEXT_SECONDARY: string = '#666666';

  // 画布元素
  static readonly GRID_DOT: string = '#CCCCCC';
  static readonly GRID_LINE: string = '#D5D5D5';
  static readonly WIRE: string = '#0000CC';
  static readonly BUS: string = '#006699';
  static readonly COMPONENT_STROKE: string = '#222222';
  static readonly COMPONENT_BODY_FILL: string = '#EBEEF2';
  static readonly SELECTED: string = '#0066CC';
  static readonly HOVER_PREVIEW: string = '#00AAFF';
  static readonly POWER: string = '#FF6600';
  static readonly GROUND: string = '#666666';
  static readonly ANALOG: string = '#0066FF';
  static readonly DIGITAL: string = '#009933';
  static readonly CLOCK: string = '#EE0000';

  // 弹窗
  static readonly DIALOG_TITLE: string = '#203050';
  static readonly DIALOG_TITLE_TEXT: string = '#FFFFFF';

  // 按钮
  static readonly BTN_BG: string = '#E0E0E0';
  static readonly BTN_PRESSED: string = '#C0C0C0';
  static readonly BTN_FOCUS: string = '#0066CC';

  // 状态栏
  static readonly ERC_OK: string = '#009933';
  static readonly ERC_WARN: string = '#CC9900';
  static readonly ERC_ERR: string = '#CC0000';
}

/** 深色主题（Proteus 夜间模式） */
export class ProteusDarkColors {
  static readonly MENU_BG: string = '#2D2D30';
  static readonly TOOLBAR_BG: string = '#333337';
  static readonly PANEL_TITLE_BG: string = '#252526';
  static readonly STATUS_BAR_BG: string = '#007ACC';
  static readonly CANVAS_BG: string = '#1E1E1E';
  static readonly TEXT_PRIMARY: string = '#CCCCCC';
  static readonly GRID_DOT: string = '#3C3C3C';
  static readonly WIRE: string = '#569CD6';
  static readonly SELECTED: string = '#007ACC';
}

/** 浅色主题（默认 Proteus 经典） */
export class ProteusLightColors {
  static readonly MENU_BG: string = ProteusColors.MENU_BG;
  static readonly CANVAS_BG: string = ProteusColors.CANVAS_BG;
  static readonly TEXT_PRIMARY: string = ProteusColors.TEXT_PRIMARY;
}

export type ThemeMode = 'light' | 'dark';

export class ProteusDimens {
  static readonly MENU_HEIGHT: number = 24;
  static readonly TOOLBAR_HEIGHT: number = 32;
  static readonly STATUS_HEIGHT: number = 24;
  static readonly LEFT_PANEL_WIDTH: number = 220;
  static readonly RIGHT_PANEL_WIDTH: number = 240;
  static readonly PANEL_TITLE_HEIGHT: number = 22;
  static readonly SEARCH_HEIGHT: number = 24;
  static readonly TREE_ROW_HEIGHT: number = 20;
  static readonly NAV_ROW_HEIGHT: number = 18;
  static readonly PREVIEW_HEIGHT: number = 260;
  static readonly PARAM_ROW_HEIGHT: number = 22;
  static readonly PARAM_GAP: number = 4;
  static readonly ICON_SIZE: number = 16;
  static readonly TOOL_BTN_SIZE: number = 24;
  static readonly RULER_SIZE: number = 20;
}

export class ProteusFonts {
  static readonly MENU: number = 12;
  static readonly TOOLBAR: number = 11;
  static readonly TITLE: number = 12;
  static readonly PARAM_KEY: number = 11;
  static readonly PARAM_VALUE: number = 12;
  static readonly STATUS: number = 10;
  static readonly CANVAS_LABEL: number = 12;
  static readonly RULER: number = 10;
}
