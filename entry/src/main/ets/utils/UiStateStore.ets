/**
 * UI 状态持久化 — 包装 AppStorage，按用户存于应用沙箱。
 * 字段：面板宽、折叠状态、当前 Tab、工具模式、网格/标尺可见性、左面板类别展开集。
 */
import { EditorToolMode } from '../model/EditorToolMode';
import { ComponentCategory } from 'common';

const NS = 'ui_state_';

export class UiStateStore {
  private static _instance: UiStateStore;
  static getInstance(): UiStateStore {
    if (!UiStateStore._instance) UiStateStore._instance = new UiStateStore();
    return UiStateStore._instance;
  }

  private writeNum(key: string, val: number): void {
    AppStorage.setOrCreate(`${NS}${key}`, val);
  }
  private readNum(key: string, def: number): number {
    const v: object | undefined = AppStorage.get(`${NS}${key}`);
    return typeof v === 'number' ? (v as number) : def;
  }
  private writeBool(key: string, val: boolean): void {
    AppStorage.setOrCreate(`${NS}${key}`, val);
  }
  private readBool(key: string, def: boolean): boolean {
    const v: object | undefined = AppStorage.get(`${NS}${key}`);
    return typeof v === 'boolean' ? (v as boolean) : def;
  }
  private writeStr(key: string, val: string): void {
    AppStorage.setOrCreate(`${NS}${key}`, val);
  }
  private readStr(key: string, def: string): string {
    const v: object | undefined = AppStorage.get(`${NS}${key}`);
    return typeof v === 'string' ? (v as string) : def;
  }

  // 面板宽
  get leftPanelWidth(): number { return this.readNum('left_panel_w', 240); }
  set leftPanelWidth(v: number) {
    const clamped = Math.min(400, Math.max(160, Math.round(v)));
    this.writeNum('left_panel_w', clamped);
  }
  get rightPanelWidth(): number { return this.readNum('right_panel_w', 260); }
  set rightPanelWidth(v: number) {
    const clamped = Math.min(420, Math.max(200, Math.round(v)));
    this.writeNum('right_panel_w', clamped);
  }

  // 折叠
  get leftLibCollapsed(): boolean { return this.readBool('left_lib_collapsed', false); }
  set leftLibCollapsed(v: boolean) { this.writeBool('left_lib_collapsed', v); }
  get leftNavCollapsed(): boolean { return this.readBool('left_nav_collapsed', false); }
  set leftNavCollapsed(v: boolean) { this.writeBool('left_nav_collapsed', v); }
  get rightCollapsed(): boolean { return this.readBool('right_collapsed', false); }
  set rightCollapsed(v: boolean) { this.writeBool('right_collapsed', v); }

  // 右侧 Tab
  get activeRightTab(): number { return this.readNum('active_right_tab', 0); }
  set activeRightTab(v: number) { this.writeNum('active_right_tab', v); }

  // 视图
  get gridVisible(): boolean { return this.readBool('grid_visible', true); }
  set gridVisible(v: boolean) { this.writeBool('grid_visible', v); }
  get rulerVisible(): boolean { return this.readBool('ruler_visible', true); }
  set rulerVisible(v: boolean) { this.writeBool('ruler_visible', v); }

  // 工具模式
  get toolMode(): EditorToolMode {
    const v = this.readStr('tool_mode', EditorToolMode.SELECT);
    return v as EditorToolMode;
  }
  set toolMode(v: EditorToolMode) { this.writeStr('tool_mode', v); }

  // 左面板类别展开集 — 编码为逗号分隔字符串
  getExpandedCategories(): Set<ComponentCategory> {
    const s = this.readStr('expanded_cats', '');
    const out = new Set<ComponentCategory>();
    if (s.length === 0) return out;
    s.split(',').forEach((p: string) => {
      if (p.length > 0) out.add(p as ComponentCategory);
    });
    return out;
  }
  setExpandedCategories(set: Set<ComponentCategory>): void {
    const arr: string[] = [];
    set.forEach((c: ComponentCategory) => arr.push(c));
    this.writeStr('expanded_cats', arr.join(','));
  }
}
