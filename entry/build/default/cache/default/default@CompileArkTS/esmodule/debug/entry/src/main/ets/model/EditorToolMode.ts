/**
 * 编辑器工具模式
 */
export enum EditorToolMode {
    SELECT = "select",
    PLACE = "place",
    WIRE = "wire",
    BUS = "bus",
    LABEL = "label",
    POWER = "power",
    GROUND = "ground",
    /** 拖框指定区域放大 */
    ZOOM_REGION = "zoom_region"
}
export function toolModeLabel(mode: EditorToolMode): string {
    switch (mode) {
        case EditorToolMode.SELECT: return '选择';
        case EditorToolMode.PLACE: return '放置器件';
        case EditorToolMode.WIRE: return '绘制导线';
        case EditorToolMode.BUS: return '绘制总线';
        case EditorToolMode.LABEL: return '网络标签';
        case EditorToolMode.POWER: return '放置电源';
        case EditorToolMode.GROUND: return '放置地';
        case EditorToolMode.ZOOM_REGION: return '区域放大';
        default: return '选择';
    }
}
