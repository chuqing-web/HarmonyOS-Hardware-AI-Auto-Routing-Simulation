import { EditorToolMode } from "@bundle:com.elecdraw.aischsim/entry/ets/model/EditorToolMode";
import type { ComponentCategory } from 'common';
const NS = 'ui_state_';
export class UiStateStore {
    private static _instance: UiStateStore;
    static getInstance(): UiStateStore {
        if (!UiStateStore._instance)
            UiStateStore._instance = new UiStateStore();
        return UiStateStore._instance;
    }
    private writeNum(p251: string, q251: number): void {
        AppStorage.setOrCreate(`${NS}${p251}`, q251);
    }
    private readNum(m251: string, n251: number): number {
        const o251: object | undefined = AppStorage.get(`${NS}${m251}`);
        return typeof o251 === 'number' ? (o251 as number) : n251;
    }
    private writeBool(k251: string, l251: boolean): void {
        AppStorage.setOrCreate(`${NS}${k251}`, l251);
    }
    private readBool(h251: string, i251: boolean): boolean {
        const j251: object | undefined = AppStorage.get(`${NS}${h251}`);
        return typeof j251 === 'boolean' ? (j251 as boolean) : i251;
    }
    private writeStr(f251: string, g251: string): void {
        AppStorage.setOrCreate(`${NS}${f251}`, g251);
    }
    private readStr(c251: string, d251: string): string {
        const e251: object | undefined = AppStorage.get(`${NS}${c251}`);
        return typeof e251 === 'string' ? (e251 as string) : d251;
    }
    get leftPanelWidth(): number { return this.readNum('left_panel_w', 240); }
    set leftPanelWidth(a251: number) {
        const b251 = Math.min(400, Math.max(160, Math.round(a251)));
        this.writeNum('left_panel_w', b251);
    }
    get rightPanelWidth(): number { return this.readNum('right_panel_w', 300); }
    set rightPanelWidth(y250: number) {
        const z250 = Math.min(420, Math.max(200, Math.round(y250)));
        this.writeNum('right_panel_w', z250);
    }
    get leftLibCollapsed(): boolean { return this.readBool('left_lib_collapsed', false); }
    set leftLibCollapsed(x250: boolean) { this.writeBool('left_lib_collapsed', x250); }
    get leftNavCollapsed(): boolean { return this.readBool('left_nav_collapsed', false); }
    set leftNavCollapsed(w250: boolean) { this.writeBool('left_nav_collapsed', w250); }
    get rightCollapsed(): boolean { return this.readBool('right_collapsed', false); }
    set rightCollapsed(v250: boolean) { this.writeBool('right_collapsed', v250); }
    get activeRightTab(): number { return this.readNum('active_right_tab', 0); }
    set activeRightTab(u250: number) { this.writeNum('active_right_tab', u250); }
    get gridVisible(): boolean { return this.readBool('grid_visible', true); }
    set gridVisible(t250: boolean) { this.writeBool('grid_visible', t250); }
    get rulerVisible(): boolean { return this.readBool('ruler_visible', true); }
    set rulerVisible(s250: boolean) { this.writeBool('ruler_visible', s250); }
    get toolMode(): EditorToolMode {
        const q250 = this.readStr('tool_mode', EditorToolMode.SELECT);
        return q250 as EditorToolMode;
    }
    set toolMode(r250: EditorToolMode) { this.writeStr('tool_mode', r250); }
    getExpandedCategories(): Set<ComponentCategory> {
        const n250 = this.readStr('expanded_cats', '');
        const o250 = new Set<ComponentCategory>();
        if (n250.length === 0)
            return o250;
        n250.split(',').forEach((p250: string) => {
            if (p250.length > 0)
                o250.add(p250 as ComponentCategory);
        });
        return o250;
    }
    setExpandedCategories(k250: Set<ComponentCategory>): void {
        const l250: string[] = [];
        k250.forEach((m250: ComponentCategory) => l250.push(m250));
        this.writeStr('expanded_cats', l250.join(','));
    }
}
