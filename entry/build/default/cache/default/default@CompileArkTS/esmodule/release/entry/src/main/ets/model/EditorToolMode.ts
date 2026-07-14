export enum EditorToolMode {
    SELECT = "select",
    PLACE = "place",
    WIRE = "wire",
    BUS = "bus",
    LABEL = "label",
    POWER = "power",
    GROUND = "ground"
}
export function toolModeLabel(u172: EditorToolMode): string {
    switch (u172) {
        case EditorToolMode.SELECT: return '选择';
        case EditorToolMode.PLACE: return '放置器件';
        case EditorToolMode.WIRE: return '绘制导线';
        case EditorToolMode.BUS: return '绘制总线';
        case EditorToolMode.LABEL: return '网络标签';
        case EditorToolMode.POWER: return '放置电源';
        case EditorToolMode.GROUND: return '放置地';
        default: return '选择';
    }
}
