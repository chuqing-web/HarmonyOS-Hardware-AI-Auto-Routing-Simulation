/**
 * Proteus 风格单色图标系统 — 24x24 SVG path 数据
 * 用于工具栏、菜单、浮动栏。无二进制资源，鸿蒙 Shape/Path 渲染。
 */
import { ProteusColors } from '../../theme/ProteusTheme';

export enum ProteusIconName {
  // File
  NEW = 'new',
  OPEN = 'open',
  SAVE = 'save',
  // History
  UNDO = 'undo',
  REDO = 'redo',
  TRASH = 'trash',
  // Edit
  CUT = 'cut',
  COPY = 'copy',
  PASTE = 'paste',
  // View
  ZOOM_IN = 'zoom_in',
  ZOOM_OUT = 'zoom_out',
  FIT = 'fit',
  GRID = 'grid',
  RULER = 'ruler',
  // Place
  COMPONENT = 'component',
  WIRE = 'wire',
  BUS = 'bus',
  LABEL = 'label',
  POWER = 'power',
  GROUND = 'ground',
  // Align
  ALIGN_LEFT = 'align_left',
  ALIGN_RIGHT = 'align_right',
  ALIGN_TOP = 'align_top',
  DISTRIBUTE = 'distribute',
  ROTATE = 'rotate',
  MIRROR = 'mirror',
  // Sim
  PLAY = 'play',
  PAUSE = 'pause',
  STOP = 'stop',
  ERC = 'erc',
  // AI
  AI_ROUTE = 'ai_route',
  AI_LAYOUT = 'ai_layout',
  AI_DIAG = 'ai_diag',
  // Misc
  MORE = 'more',
  CHEVRON_DOWN = 'chevron_down',
  CHEVRON_RIGHT = 'chevron_right',
  SEARCH = 'search',
  SETTINGS = 'settings',
  HOME = 'home',
  CLOSE = 'close',
  CHECK = 'check',
  WARNING = 'warning',
  // PCB
  SELECT = 'select',
  TRACK = 'track',
  VIA = 'via',
  ZONE = 'zone',
  LAYER = 'layer',
  DRC = 'drc',
}

const ICON_PATHS: Record<ProteusIconName, string> = {
  [ProteusIconName.NEW]: 'M14 3v4a1 1 0 0 0 1 1h4M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  [ProteusIconName.OPEN]: 'M6 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2z',
  [ProteusIconName.SAVE]: 'M6 4h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M9 4v5h6V4 M8 14h8v6H8z',
  [ProteusIconName.UNDO]: 'M9 8L4 12l5 4 M4 12h11a5 5 0 0 1 5 5v1',
  [ProteusIconName.REDO]: 'M15 8l5 4-5 4 M20 12H9a5 5 0 0 0-5 5v1',
  [ProteusIconName.TRASH]: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  [ProteusIconName.CUT]: 'M6 6l12 12 M18 6L6 18 M9 9a3 3 0 1 1-4 4 3 3 0 0 1 4-4z M9 15a3 3 0 1 0-4-4 3 3 0 0 0 4 4z',
  [ProteusIconName.COPY]: 'M8 8V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3 M5 8h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
  [ProteusIconName.PASTE]: 'M10 4h4v2h-4z M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2 M8 4v2h8V4',
  [ProteusIconName.ZOOM_IN]: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M21 21l-5-5 M11 8v6 M8 11h6',
  [ProteusIconName.ZOOM_OUT]: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M21 21l-5-5 M8 11h6',
  [ProteusIconName.FIT]: 'M4 4h6 M4 4v6 M4 20h6 M4 20v-6 M20 4h-6 M20 4v6 M20 20h-6 M20 20v-6',
  [ProteusIconName.GRID]: 'M4 4h16v16H4z M4 10h16 M4 14h16 M10 4v16 M14 4v16',
  [ProteusIconName.RULER]: 'M4 6h16v12H4z M8 6v3 M12 6v3 M16 6v3 M8 15v3 M12 15v3 M16 15v3',
  [ProteusIconName.COMPONENT]: 'M7 7h10v10H7z M10 4v3 M14 4v3 M10 17v3 M14 17v3 M4 10h3 M4 14h3 M17 10h3 M17 14h3',
  [ProteusIconName.WIRE]: 'M3 12h4 M7 12c0-3 3-6 6-6 M13 6h4 M7 12c0 3 3 6 6 6 M13 18h4',
  [ProteusIconName.BUS]: 'M3 8h18 M3 16h18 M7 8v8 M12 8v8 M17 8v8',
  [ProteusIconName.LABEL]: 'M5 12l7-7h7v7l-7 7-7-7z M16 9.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',
  [ProteusIconName.POWER]: 'M12 4v9 M7 8a6 6 0 1 0 10 0',
  [ProteusIconName.GROUND]: 'M12 4v10 M5 15h14 M8 18h8 M10 21h4',
  [ProteusIconName.ALIGN_LEFT]: 'M4 4v16 M8 7h10 M8 12h7 M8 17h12',
  [ProteusIconName.ALIGN_RIGHT]: 'M20 4v16 M6 7h10 M9 12h7 M4 17h12',
  [ProteusIconName.ALIGN_TOP]: 'M4 4h16 M7 8v10 M12 8v7 M17 8v12',
  [ProteusIconName.DISTRIBUTE]: 'M3 4v16 M21 4v16 M7 7h10v10H7z',
  [ProteusIconName.ROTATE]: 'M4 12a8 8 0 1 0 8-8 M12 4l4 4-4 4',
  [ProteusIconName.MIRROR]: 'M12 3v18 M5 8l4 4-4 4 M19 8l-4 4 4 4',
  [ProteusIconName.PLAY]: 'M6 4l14 8-14 8V4z',
  [ProteusIconName.PAUSE]: 'M6 4h4v16H6z M14 4h4v16h-4z',
  [ProteusIconName.STOP]: 'M5 5h14v14H5z',
  [ProteusIconName.ERC]: 'M4 12l5 5L20 6 M4 18h10',
  [ProteusIconName.AI_ROUTE]: 'M5 19l4-8 4 4 6-10 M3 19h18',
  [ProteusIconName.AI_LAYOUT]: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  [ProteusIconName.AI_DIAG]: 'M6 4v6a6 6 0 0 0 12 0V4 M9 4h6 M12 16v4',
  [ProteusIconName.MORE]: 'M7 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z M19 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
  [ProteusIconName.CHEVRON_DOWN]: 'M6 9l6 6 6-6',
  [ProteusIconName.CHEVRON_RIGHT]: 'M9 6l6 6-6 6',
  [ProteusIconName.SEARCH]: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M21 21l-5-5',
  [ProteusIconName.SETTINGS]: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M12 2v3 M12 19v3 M4.93 4.93l2.12 2.12 M16.95 16.95l2.12 2.12 M2 12h3 M19 12h3 M4.93 19.07l2.12-2.12 M16.95 7.05l2.12-2.12',
  [ProteusIconName.HOME]: 'M4 10.5L12 4l8 6.5V20H4V10.5z M9 20v-6h6v6',
  [ProteusIconName.CLOSE]: 'M6 6l12 12 M18 6L6 18',
  [ProteusIconName.CHECK]: 'M5 12l5 5L20 6',
  [ProteusIconName.WARNING]: 'M12 3l9 16H3z M12 9v5 M12 18v.5',
  [ProteusIconName.SELECT]: 'M4 4l6 14 2-6 6-2z',
  [ProteusIconName.TRACK]: 'M3 12h5 M8 12c0-4 4-7 8-7 M16 5h5 M8 12c0 4 4 7 8 7 M16 19h5',
  [ProteusIconName.VIA]: 'M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  [ProteusIconName.ZONE]: 'M4 8l8-4 8 4v8l-8 4-8-4V8z M12 4v16',
  [ProteusIconName.LAYER]: 'M4 6l8-3 8 3-8 3-8-3z M4 12l8 3 8-3 M4 18l8 3 8-3',
  [ProteusIconName.DRC]: 'M4 12l5 5L20 6 M12 3l9 16H3',
};

@Component
export struct ProteusIcon {
  @Prop name: ProteusIconName = ProteusIconName.SEARCH;
  @Prop iconSize: number = 16;
  @Prop color: string = ProteusColors.TEXT_PRIMARY;

  build() {
    Shape() {
      Path()
        .commands(ICON_PATHS[this.name] ?? '')
        .fillOpacity(0)
        .stroke(this.color)
        .strokeWidth(1.6)
        .strokeLineJoin(LineJoinStyle.Miter)
        .strokeLineCap(LineCapStyle.Round)
    }
    .viewPort({ x: 0, y: 0, width: 24, height: 24 })
    .width(this.iconSize)
    .height(this.iconSize)
  }
}
