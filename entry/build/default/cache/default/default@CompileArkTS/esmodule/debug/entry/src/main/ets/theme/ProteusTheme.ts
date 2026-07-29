/**
 * Proteus 8.16 像素级 UI 主题常量
 * 传统 EDA 工业界面 — 直角、无圆角、无阴影、无渐变
 *
 * 颜色/字号为可变静态字段：ThemeManager / 无障碍设置通过 applyTheme / setFontScale 即时生效。
 */
/**
 * 主题色板（ArkTS 要求对象字面量对应显式类型）
 */
interface ProteusThemePalette {
    MENU_BG: string;
    TOOLBAR_BG: string;
    PANEL_TITLE_BG: string;
    STATUS_BAR_BG: string;
    CANVAS_BG: string;
    PREVIEW_BG: string;
    INPUT_READONLY_BG: string;
    MENU_HOVER: string;
    TOOL_HOVER: string;
    TOOL_ACTIVE: string;
    TREE_HOVER: string;
    TREE_SELECTED: string;
    BORDER: string;
    DIVIDER: string;
    INPUT_BORDER: string;
    INPUT_FOCUS: string;
    WINDOW_BORDER: string;
    TEXT_PRIMARY: string;
    TEXT_LABEL: string;
    TEXT_SECONDARY: string;
    GRID_DOT: string;
    GRID_LINE: string;
    WIRE: string;
    BUS: string;
    COMPONENT_STROKE: string;
    COMPONENT_BODY_FILL: string;
    SELECTED: string;
    HOVER_PREVIEW: string;
    POWER: string;
    GROUND: string;
    ANALOG: string;
    DIGITAL: string;
    CLOCK: string;
    DIALOG_TITLE: string;
    DIALOG_TITLE_TEXT: string;
    BTN_BG: string;
    BTN_PRESSED: string;
    BTN_FOCUS: string;
    ERC_OK: string;
    ERC_WARN: string;
    ERC_ERR: string;
    SIDEBAR_BG: string;
    SIDEBAR_TAB_IDLE_BG: string;
    SIDEBAR_TAB_IDLE_TEXT: string;
    SIDEBAR_TAB_ACTIVE_BG: string;
    SIDEBAR_TAB_ACTIVE_TEXT: string;
    SIDEBAR_TAB_BORDER: string;
    TAB_CHIP_IDLE_BG: string;
    TAB_CHIP_IDLE_TEXT: string;
    TAB_CHIP_ACTIVE_BG: string;
    TAB_CHIP_ACTIVE_TEXT: string;
    TAB_CHIP_BORDER: string;
    TAB_BAR_BG: string;
    TOGGLE_OFF_TRACK: string;
    TOGGLE_KNOB: string;
}
/** 浅色主题基线（用于 reset） */
const LIGHT: ProteusThemePalette = {
    MENU_BG: '#F0F0F0',
    TOOLBAR_BG: '#F6F6F6',
    PANEL_TITLE_BG: '#E8E8E8',
    STATUS_BAR_BG: '#F0F0F0',
    CANVAS_BG: '#FFFFFF',
    PREVIEW_BG: '#F2F2F2',
    INPUT_READONLY_BG: '#F0F0F0',
    MENU_HOVER: '#D0D0D0',
    TOOL_HOVER: '#E0E0E0',
    TOOL_ACTIVE: '#C8C8C8',
    TREE_HOVER: '#E5F3FF',
    TREE_SELECTED: '#C0E0FF',
    BORDER: '#BBBBBB',
    DIVIDER: '#CCCCCC',
    INPUT_BORDER: '#AAAAAA',
    INPUT_FOCUS: '#666666',
    WINDOW_BORDER: '#888888',
    TEXT_PRIMARY: '#000000',
    TEXT_LABEL: '#444444',
    TEXT_SECONDARY: '#666666',
    GRID_DOT: '#CCCCCC',
    GRID_LINE: '#D5D5D5',
    WIRE: '#0000CC',
    BUS: '#006699',
    COMPONENT_STROKE: '#222222',
    COMPONENT_BODY_FILL: '#EBEEF2',
    SELECTED: '#0066CC',
    HOVER_PREVIEW: '#00AAFF',
    POWER: '#FF6600',
    GROUND: '#666666',
    ANALOG: '#0066FF',
    DIGITAL: '#009933',
    CLOCK: '#EE0000',
    DIALOG_TITLE: '#203050',
    DIALOG_TITLE_TEXT: '#FFFFFF',
    BTN_BG: '#E0E0E0',
    BTN_PRESSED: '#C0C0C0',
    BTN_FOCUS: '#0066CC',
    ERC_OK: '#009933',
    ERC_WARN: '#CC9900',
    ERC_ERR: '#CC0000',
    SIDEBAR_BG: '#C4C4C4',
    SIDEBAR_TAB_IDLE_BG: '#A8A8A8',
    SIDEBAR_TAB_IDLE_TEXT: '#1A1A1A',
    SIDEBAR_TAB_ACTIVE_BG: '#FFFFFF',
    SIDEBAR_TAB_ACTIVE_TEXT: '#000000',
    SIDEBAR_TAB_BORDER: '#909090',
    TAB_CHIP_IDLE_BG: '#E4E4E4',
    TAB_CHIP_IDLE_TEXT: '#333333',
    TAB_CHIP_ACTIVE_BG: '#0066CC',
    TAB_CHIP_ACTIVE_TEXT: '#FFFFFF',
    TAB_CHIP_BORDER: '#999999',
    TAB_BAR_BG: '#EDEDED',
    // Switch 关闭态：灰轨道 + 白滑块，避免白底上看不清
    TOGGLE_OFF_TRACK: '#9E9E9E',
    TOGGLE_KNOB: '#FFFFFF'
};
const DARK: ProteusThemePalette = {
    MENU_BG: '#2D2D30',
    TOOLBAR_BG: '#333337',
    PANEL_TITLE_BG: '#252526',
    // 状态栏与面板同系，避免刺眼蓝条抢走画布对比
    STATUS_BAR_BG: '#252526',
    CANVAS_BG: '#1A1A1E',
    PREVIEW_BG: '#252526',
    INPUT_READONLY_BG: '#2D2D30',
    MENU_HOVER: '#3E3E42',
    TOOL_HOVER: '#3E3E42',
    TOOL_ACTIVE: '#094771',
    TREE_HOVER: '#2A2D2E',
    TREE_SELECTED: '#094771',
    BORDER: '#555555',
    DIVIDER: '#3E3E42',
    INPUT_BORDER: '#555555',
    INPUT_FOCUS: '#007ACC',
    WINDOW_BORDER: '#555555',
    TEXT_PRIMARY: '#E0E0E0',
    TEXT_LABEL: '#B0B0B0',
    TEXT_SECONDARY: '#8A8A8A',
    // 网格需在深色底上可辨
    GRID_DOT: '#4A4A52',
    GRID_LINE: '#2E2E36',
    WIRE: '#6CB6FF',
    BUS: '#4EC9B0',
    COMPONENT_STROKE: '#E6E6E6',
    // 器件体填充与画布拉开对比，避免“黑底黑框”
    COMPONENT_BODY_FILL: '#2F3340',
    SELECTED: '#3B9EFF',
    HOVER_PREVIEW: '#3794FF',
    POWER: '#CE9178',
    GROUND: '#9A9A9A',
    ANALOG: '#6CB6FF',
    DIGITAL: '#6A9955',
    CLOCK: '#F44747',
    DIALOG_TITLE: '#007ACC',
    DIALOG_TITLE_TEXT: '#FFFFFF',
    BTN_BG: '#3E3E42',
    BTN_PRESSED: '#094771',
    BTN_FOCUS: '#007ACC',
    ERC_OK: '#6A9955',
    ERC_WARN: '#DCDCAA',
    ERC_ERR: '#F44747',
    SIDEBAR_BG: '#252526',
    SIDEBAR_TAB_IDLE_BG: '#3E3E42',
    SIDEBAR_TAB_IDLE_TEXT: '#CCCCCC',
    SIDEBAR_TAB_ACTIVE_BG: '#1A1A1E',
    SIDEBAR_TAB_ACTIVE_TEXT: '#FFFFFF',
    SIDEBAR_TAB_BORDER: '#555555',
    TAB_CHIP_IDLE_BG: '#3E3E42',
    TAB_CHIP_IDLE_TEXT: '#CCCCCC',
    TAB_CHIP_ACTIVE_BG: '#007ACC',
    TAB_CHIP_ACTIVE_TEXT: '#FFFFFF',
    TAB_CHIP_BORDER: '#555555',
    TAB_BAR_BG: '#2D2D30',
    TOGGLE_OFF_TRACK: '#6B6B6B',
    TOGGLE_KNOB: '#FFFFFF'
};
export class ProteusColors {
    static MENU_BG: string = LIGHT.MENU_BG;
    static TOOLBAR_BG: string = LIGHT.TOOLBAR_BG;
    static PANEL_TITLE_BG: string = LIGHT.PANEL_TITLE_BG;
    static STATUS_BAR_BG: string = LIGHT.STATUS_BAR_BG;
    static CANVAS_BG: string = LIGHT.CANVAS_BG;
    static PREVIEW_BG: string = LIGHT.PREVIEW_BG;
    static INPUT_READONLY_BG: string = LIGHT.INPUT_READONLY_BG;
    static MENU_HOVER: string = LIGHT.MENU_HOVER;
    static TOOL_HOVER: string = LIGHT.TOOL_HOVER;
    static TOOL_ACTIVE: string = LIGHT.TOOL_ACTIVE;
    static TREE_HOVER: string = LIGHT.TREE_HOVER;
    static TREE_SELECTED: string = LIGHT.TREE_SELECTED;
    static BORDER: string = LIGHT.BORDER;
    static DIVIDER: string = LIGHT.DIVIDER;
    static INPUT_BORDER: string = LIGHT.INPUT_BORDER;
    static INPUT_FOCUS: string = LIGHT.INPUT_FOCUS;
    static WINDOW_BORDER: string = LIGHT.WINDOW_BORDER;
    static TEXT_PRIMARY: string = LIGHT.TEXT_PRIMARY;
    static TEXT_LABEL: string = LIGHT.TEXT_LABEL;
    static TEXT_SECONDARY: string = LIGHT.TEXT_SECONDARY;
    static GRID_DOT: string = LIGHT.GRID_DOT;
    static GRID_LINE: string = LIGHT.GRID_LINE;
    static WIRE: string = LIGHT.WIRE;
    static BUS: string = LIGHT.BUS;
    static COMPONENT_STROKE: string = LIGHT.COMPONENT_STROKE;
    static COMPONENT_BODY_FILL: string = LIGHT.COMPONENT_BODY_FILL;
    static SELECTED: string = LIGHT.SELECTED;
    static HOVER_PREVIEW: string = LIGHT.HOVER_PREVIEW;
    static POWER: string = LIGHT.POWER;
    static GROUND: string = LIGHT.GROUND;
    static ANALOG: string = LIGHT.ANALOG;
    static DIGITAL: string = LIGHT.DIGITAL;
    static CLOCK: string = LIGHT.CLOCK;
    static DIALOG_TITLE: string = LIGHT.DIALOG_TITLE;
    static DIALOG_TITLE_TEXT: string = LIGHT.DIALOG_TITLE_TEXT;
    static BTN_BG: string = LIGHT.BTN_BG;
    static BTN_PRESSED: string = LIGHT.BTN_PRESSED;
    static BTN_FOCUS: string = LIGHT.BTN_FOCUS;
    static ERC_OK: string = LIGHT.ERC_OK;
    static ERC_WARN: string = LIGHT.ERC_WARN;
    static ERC_ERR: string = LIGHT.ERC_ERR;
    static SIDEBAR_BG: string = LIGHT.SIDEBAR_BG;
    static SIDEBAR_TAB_IDLE_BG: string = LIGHT.SIDEBAR_TAB_IDLE_BG;
    static SIDEBAR_TAB_IDLE_TEXT: string = LIGHT.SIDEBAR_TAB_IDLE_TEXT;
    static SIDEBAR_TAB_ACTIVE_BG: string = LIGHT.SIDEBAR_TAB_ACTIVE_BG;
    static SIDEBAR_TAB_ACTIVE_TEXT: string = LIGHT.SIDEBAR_TAB_ACTIVE_TEXT;
    static SIDEBAR_TAB_BORDER: string = LIGHT.SIDEBAR_TAB_BORDER;
    static TAB_CHIP_IDLE_BG: string = LIGHT.TAB_CHIP_IDLE_BG;
    static TAB_CHIP_IDLE_TEXT: string = LIGHT.TAB_CHIP_IDLE_TEXT;
    static TAB_CHIP_ACTIVE_BG: string = LIGHT.TAB_CHIP_ACTIVE_BG;
    static TAB_CHIP_ACTIVE_TEXT: string = LIGHT.TAB_CHIP_ACTIVE_TEXT;
    static TAB_CHIP_BORDER: string = LIGHT.TAB_CHIP_BORDER;
    static TAB_BAR_BG: string = LIGHT.TAB_BAR_BG;
    static TOGGLE_OFF_TRACK: string = LIGHT.TOGGLE_OFF_TRACK;
    static TOGGLE_KNOB: string = LIGHT.TOGGLE_KNOB;
    /** 将当前主题/高对比度写回静态色板，供全 UI 立即读取 */
    static applyTheme(dark: boolean, highContrast: boolean = false): void {
        const src = dark ? DARK : LIGHT;
        ProteusColors.MENU_BG = src.MENU_BG;
        ProteusColors.TOOLBAR_BG = src.TOOLBAR_BG;
        ProteusColors.PANEL_TITLE_BG = src.PANEL_TITLE_BG;
        ProteusColors.STATUS_BAR_BG = src.STATUS_BAR_BG;
        ProteusColors.CANVAS_BG = src.CANVAS_BG;
        ProteusColors.PREVIEW_BG = src.PREVIEW_BG;
        ProteusColors.INPUT_READONLY_BG = src.INPUT_READONLY_BG;
        ProteusColors.MENU_HOVER = src.MENU_HOVER;
        ProteusColors.TOOL_HOVER = src.TOOL_HOVER;
        ProteusColors.TOOL_ACTIVE = src.TOOL_ACTIVE;
        ProteusColors.TREE_HOVER = src.TREE_HOVER;
        ProteusColors.TREE_SELECTED = src.TREE_SELECTED;
        ProteusColors.BORDER = src.BORDER;
        ProteusColors.DIVIDER = src.DIVIDER;
        ProteusColors.INPUT_BORDER = src.INPUT_BORDER;
        ProteusColors.INPUT_FOCUS = src.INPUT_FOCUS;
        ProteusColors.WINDOW_BORDER = src.WINDOW_BORDER;
        ProteusColors.TEXT_PRIMARY = src.TEXT_PRIMARY;
        ProteusColors.TEXT_LABEL = src.TEXT_LABEL;
        ProteusColors.TEXT_SECONDARY = src.TEXT_SECONDARY;
        ProteusColors.GRID_DOT = src.GRID_DOT;
        ProteusColors.GRID_LINE = src.GRID_LINE;
        ProteusColors.WIRE = src.WIRE;
        ProteusColors.BUS = src.BUS;
        ProteusColors.COMPONENT_STROKE = src.COMPONENT_STROKE;
        ProteusColors.COMPONENT_BODY_FILL = src.COMPONENT_BODY_FILL;
        ProteusColors.SELECTED = src.SELECTED;
        ProteusColors.HOVER_PREVIEW = src.HOVER_PREVIEW;
        ProteusColors.POWER = src.POWER;
        ProteusColors.GROUND = src.GROUND;
        ProteusColors.ANALOG = src.ANALOG;
        ProteusColors.DIGITAL = src.DIGITAL;
        ProteusColors.CLOCK = src.CLOCK;
        ProteusColors.DIALOG_TITLE = src.DIALOG_TITLE;
        ProteusColors.DIALOG_TITLE_TEXT = src.DIALOG_TITLE_TEXT;
        ProteusColors.BTN_BG = src.BTN_BG;
        ProteusColors.BTN_PRESSED = src.BTN_PRESSED;
        ProteusColors.BTN_FOCUS = src.BTN_FOCUS;
        ProteusColors.ERC_OK = src.ERC_OK;
        ProteusColors.ERC_WARN = src.ERC_WARN;
        ProteusColors.ERC_ERR = src.ERC_ERR;
        ProteusColors.SIDEBAR_BG = src.SIDEBAR_BG;
        ProteusColors.SIDEBAR_TAB_IDLE_BG = src.SIDEBAR_TAB_IDLE_BG;
        ProteusColors.SIDEBAR_TAB_IDLE_TEXT = src.SIDEBAR_TAB_IDLE_TEXT;
        ProteusColors.SIDEBAR_TAB_ACTIVE_BG = src.SIDEBAR_TAB_ACTIVE_BG;
        ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT = src.SIDEBAR_TAB_ACTIVE_TEXT;
        ProteusColors.SIDEBAR_TAB_BORDER = src.SIDEBAR_TAB_BORDER;
        ProteusColors.TAB_CHIP_IDLE_BG = src.TAB_CHIP_IDLE_BG;
        ProteusColors.TAB_CHIP_IDLE_TEXT = src.TAB_CHIP_IDLE_TEXT;
        ProteusColors.TAB_CHIP_ACTIVE_BG = src.TAB_CHIP_ACTIVE_BG;
        ProteusColors.TAB_CHIP_ACTIVE_TEXT = src.TAB_CHIP_ACTIVE_TEXT;
        ProteusColors.TAB_CHIP_BORDER = src.TAB_CHIP_BORDER;
        ProteusColors.TAB_BAR_BG = src.TAB_BAR_BG;
        ProteusColors.TOGGLE_OFF_TRACK = src.TOGGLE_OFF_TRACK;
        ProteusColors.TOGGLE_KNOB = src.TOGGLE_KNOB;
        if (highContrast) {
            if (dark) {
                ProteusColors.TEXT_PRIMARY = '#FFFFFF';
                ProteusColors.TEXT_LABEL = '#FFFFFF';
                ProteusColors.TEXT_SECONDARY = '#EEEEEE';
                ProteusColors.BORDER = '#FFFFFF';
                ProteusColors.DIVIDER = '#CCCCCC';
                ProteusColors.CANVAS_BG = '#000000';
                ProteusColors.COMPONENT_STROKE = '#FFFFFF';
                ProteusColors.WIRE = '#66B3FF';
                ProteusColors.SELECTED = '#FFFF00';
                ProteusColors.SIDEBAR_TAB_IDLE_TEXT = '#FFFFFF';
                ProteusColors.TOGGLE_OFF_TRACK = '#AAAAAA';
                ProteusColors.TOGGLE_KNOB = '#FFFFFF';
            }
            else {
                ProteusColors.TEXT_PRIMARY = '#000000';
                ProteusColors.TEXT_LABEL = '#000000';
                ProteusColors.TEXT_SECONDARY = '#222222';
                ProteusColors.BORDER = '#000000';
                ProteusColors.DIVIDER = '#333333';
                ProteusColors.CANVAS_BG = '#FFFFFF';
                ProteusColors.COMPONENT_STROKE = '#000000';
                ProteusColors.WIRE = '#0000AA';
                ProteusColors.SELECTED = '#0000FF';
                ProteusColors.SIDEBAR_TAB_IDLE_TEXT = '#000000';
                ProteusColors.TOGGLE_OFF_TRACK = '#666666';
                ProteusColors.TOGGLE_KNOB = '#FFFFFF';
            }
        }
        PcbColors.applyTheme(dark);
    }
}
/** @deprecated 保留兼容；请用 ProteusColors.applyTheme */
export class ProteusDarkColors {
    static readonly MENU_BG: string = DARK.MENU_BG;
    static readonly TOOLBAR_BG: string = DARK.TOOLBAR_BG;
    static readonly PANEL_TITLE_BG: string = DARK.PANEL_TITLE_BG;
    static readonly STATUS_BAR_BG: string = DARK.STATUS_BAR_BG;
    static readonly CANVAS_BG: string = DARK.CANVAS_BG;
    static readonly TEXT_PRIMARY: string = DARK.TEXT_PRIMARY;
    static readonly GRID_DOT: string = DARK.GRID_DOT;
    static readonly WIRE: string = DARK.WIRE;
    static readonly SELECTED: string = DARK.SELECTED;
}
/** @deprecated 保留兼容 */
export class ProteusLightColors {
    static readonly MENU_BG: string = LIGHT.MENU_BG;
    static readonly CANVAS_BG: string = LIGHT.CANVAS_BG;
    static readonly TEXT_PRIMARY: string = LIGHT.TEXT_PRIMARY;
}
export type ThemeMode = 'light' | 'dark';
export class ProteusDimens {
    static readonly MENU_HEIGHT: number = 24;
    static readonly TOOLBAR_HEIGHT: number = 32;
    static readonly STATUS_HEIGHT: number = 24;
    static readonly LEFT_PANEL_WIDTH: number = 220;
    static readonly RIGHT_PANEL_WIDTH: number = 240;
    static readonly PANEL_TITLE_HEIGHT: number = 22;
    static readonly SEARCH_HEIGHT: number = 30;
    static readonly TREE_ROW_HEIGHT: number = 20;
    static readonly NAV_ROW_HEIGHT: number = 18;
    static readonly PREVIEW_HEIGHT: number = 260;
    /** 单行输入：12px 字号 + 留白，占位符/正文同高 */
    static readonly PARAM_ROW_HEIGHT: number = 30;
    static readonly PARAM_GAP: number = 6;
    static readonly INPUT_PAD_H: number = 8;
    static readonly TEXTAREA_MIN_HEIGHT: number = 80;
    static readonly TAB_BAR_HEIGHT: number = 38;
    static readonly TAB_CHIP_HEIGHT: number = 30;
    static readonly PARAM_LABEL_WIDTH: number = 52;
    static readonly ICON_SIZE: number = 16;
    static readonly TOOL_BTN_SIZE: number = 24;
    static readonly RULER_SIZE: number = 20;
}
/** PCB 画布专用色板 — KiCad Pcbnew 风格 */
interface PcbThemePalette {
    CANVAS_BG: string;
    SUBSTRATE: string;
    GRID: string;
    GRID_MAJOR: string;
    BOARD_OUTLINE: string;
    SILK: string;
    PAD_SMD: string;
    PAD_SMD_NET: string;
    PAD_TH: string;
    PAD_UNCONNECTED: string;
    VIA_FILL: string;
    VIA_STROKE: string;
    ROUTE_PREVIEW: string;
    DRC_ERROR: string;
    SNAP: string;
    SEL_RECT: string;
    SEL_RECT_FILL: string;
    ZONE_GND: string;
    ZONE_SIGNAL: string;
    ZONE_SELECTED: string;
    REFDES: string;
}
const PCB_LIGHT: PcbThemePalette = {
    CANVAS_BG: '#484848',
    SUBSTRATE: '#1B5E20',
    GRID: 'rgba(255,255,255,0.06)',
    GRID_MAJOR: 'rgba(255,255,255,0.12)',
    BOARD_OUTLINE: '#FFD700',
    SILK: '#E8E8E8',
    PAD_SMD: '#B0B0B0',
    PAD_SMD_NET: '#D4A820',
    PAD_TH: '#B87333',
    PAD_UNCONNECTED: '#A0A0A0',
    VIA_FILL: '#C8C8C8',
    VIA_STROKE: '#707070',
    ROUTE_PREVIEW: '#FFFF00',
    DRC_ERROR: '#FF3333',
    SNAP: '#00FF88',
    SEL_RECT: '#00BFFF',
    SEL_RECT_FILL: 'rgba(0, 191, 255, 0.12)',
    ZONE_GND: 'rgba(192, 160, 64, 0.30)',
    ZONE_SIGNAL: 'rgba(80, 160, 224, 0.25)',
    ZONE_SELECTED: 'rgba(255, 220, 80, 0.45)',
    REFDES: '#FFFFFF'
};
const PCB_DARK: PcbThemePalette = {
    CANVAS_BG: '#1A1A1E',
    SUBSTRATE: '#0F3D0F',
    GRID: 'rgba(255,255,255,0.05)',
    GRID_MAJOR: 'rgba(255,255,255,0.10)',
    BOARD_OUTLINE: '#E8C832',
    SILK: '#D8D8D8',
    PAD_SMD: '#A0A0A0',
    PAD_SMD_NET: '#E8C040',
    PAD_TH: '#C88040',
    PAD_UNCONNECTED: '#888888',
    VIA_FILL: '#B0B0B0',
    VIA_STROKE: '#606060',
    ROUTE_PREVIEW: '#FFEE44',
    DRC_ERROR: '#FF4444',
    SNAP: '#44FF99',
    SEL_RECT: '#3794FF',
    SEL_RECT_FILL: 'rgba(55, 148, 255, 0.15)',
    ZONE_GND: 'rgba(192, 160, 64, 0.28)',
    ZONE_SIGNAL: 'rgba(80, 160, 224, 0.22)',
    ZONE_SELECTED: 'rgba(255, 220, 80, 0.42)',
    REFDES: '#F0F0F0'
};
export class PcbColors {
    static CANVAS_BG: string = PCB_LIGHT.CANVAS_BG;
    static SUBSTRATE: string = PCB_LIGHT.SUBSTRATE;
    static GRID: string = PCB_LIGHT.GRID;
    static GRID_MAJOR: string = PCB_LIGHT.GRID_MAJOR;
    static BOARD_OUTLINE: string = PCB_LIGHT.BOARD_OUTLINE;
    static SILK: string = PCB_LIGHT.SILK;
    static PAD_SMD: string = PCB_LIGHT.PAD_SMD;
    static PAD_SMD_NET: string = PCB_LIGHT.PAD_SMD_NET;
    static PAD_TH: string = PCB_LIGHT.PAD_TH;
    static PAD_UNCONNECTED: string = PCB_LIGHT.PAD_UNCONNECTED;
    static VIA_FILL: string = PCB_LIGHT.VIA_FILL;
    static VIA_STROKE: string = PCB_LIGHT.VIA_STROKE;
    static ROUTE_PREVIEW: string = PCB_LIGHT.ROUTE_PREVIEW;
    static DRC_ERROR: string = PCB_LIGHT.DRC_ERROR;
    static SNAP: string = PCB_LIGHT.SNAP;
    static SEL_RECT: string = PCB_LIGHT.SEL_RECT;
    static SEL_RECT_FILL: string = PCB_LIGHT.SEL_RECT_FILL;
    static ZONE_GND: string = PCB_LIGHT.ZONE_GND;
    static ZONE_SIGNAL: string = PCB_LIGHT.ZONE_SIGNAL;
    static ZONE_SELECTED: string = PCB_LIGHT.ZONE_SELECTED;
    static REFDES: string = PCB_LIGHT.REFDES;
    static applyTheme(dark: boolean): void {
        const src = dark ? PCB_DARK : PCB_LIGHT;
        PcbColors.CANVAS_BG = src.CANVAS_BG;
        PcbColors.SUBSTRATE = src.SUBSTRATE;
        PcbColors.GRID = src.GRID;
        PcbColors.GRID_MAJOR = src.GRID_MAJOR;
        PcbColors.BOARD_OUTLINE = src.BOARD_OUTLINE;
        PcbColors.SILK = src.SILK;
        PcbColors.PAD_SMD = src.PAD_SMD;
        PcbColors.PAD_SMD_NET = src.PAD_SMD_NET;
        PcbColors.PAD_TH = src.PAD_TH;
        PcbColors.PAD_UNCONNECTED = src.PAD_UNCONNECTED;
        PcbColors.VIA_FILL = src.VIA_FILL;
        PcbColors.VIA_STROKE = src.VIA_STROKE;
        PcbColors.ROUTE_PREVIEW = src.ROUTE_PREVIEW;
        PcbColors.DRC_ERROR = src.DRC_ERROR;
        PcbColors.SNAP = src.SNAP;
        PcbColors.SEL_RECT = src.SEL_RECT;
        PcbColors.SEL_RECT_FILL = src.SEL_RECT_FILL;
        PcbColors.ZONE_GND = src.ZONE_GND;
        PcbColors.ZONE_SIGNAL = src.ZONE_SIGNAL;
        PcbColors.ZONE_SELECTED = src.ZONE_SELECTED;
        PcbColors.REFDES = src.REFDES;
    }
}
export class ProteusFonts {
    private static scale: number = 1.0;
    static setScale(s: number): void {
        ProteusFonts.scale = Math.min(1.5, Math.max(1.0, s));
    }
    static getScale(): number {
        return ProteusFonts.scale;
    }
    private static sz(base: number): number {
        return Math.round(base * ProteusFonts.scale);
    }
    static get MENU(): number { return ProteusFonts.sz(12); }
    static get TOOLBAR(): number { return ProteusFonts.sz(11); }
    static get TITLE(): number { return ProteusFonts.sz(12); }
    static get PARAM_KEY(): number { return ProteusFonts.sz(11); }
    /** 输入框正文与占位符统一用此字号 */
    static get PARAM_VALUE(): number { return ProteusFonts.sz(12); }
    static get INPUT(): number { return ProteusFonts.PARAM_VALUE; }
    static get STATUS(): number { return ProteusFonts.sz(10); }
    static get TAB_CHIP(): number { return ProteusFonts.sz(11); }
    static get BTN_LABEL(): number { return ProteusFonts.sz(12); }
    static get CANVAS_LABEL(): number { return ProteusFonts.sz(12); }
    static get RULER(): number { return ProteusFonts.sz(10); }
}
