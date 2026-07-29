import type { Point2D, Rotation, ViewportState } from './CommonTypes';
/** KiCad 风格图层 ID（含内层铜 / 钢网） */
export enum PcbLayerId {
    F_CU = "F.Cu",
    IN1_CU = "In1.Cu",
    IN2_CU = "In2.Cu",
    IN3_CU = "In3.Cu",
    IN4_CU = "In4.Cu",
    B_CU = "B.Cu",
    F_SILKS = "F.SilkS",
    B_SILKS = "B.SilkS",
    F_MASK = "F.Mask",
    B_MASK = "B.Mask",
    F_PASTE = "F.Paste",
    B_PASTE = "B.Paste",
    EDGE_CUTS = "Edge.Cuts",
    F_FAB = "F.Fab",
    B_FAB = "B.Fab",
    COURTYARD = "F.CrtYd"
}
export enum PcbPadShape {
    CIRCLE = "circle",
    RECT = "rect",
    OVAL = "oval",
    ROUNDRECT = "roundrect"
}
export enum PcbPadType {
    SMD = "smd",
    TH = "th",
    NPTH = "npth"
}
export enum PcbViaKind {
    THROUGH = "through",
    BLIND = "blind",
    BURIED = "buried"
}
export enum PcbAppearanceMode {
    OVERLAY = "overlay",
    ACTIVE_ONLY = "active_only",
    DIM_INACTIVE = "dim_inactive"
}
export enum PcbStackLayerType {
    COPPER = "copper",
    DIELECTRIC = "dielectric",
    SOLDERMASK = "soldermask"
}
/** 焊盘（KiCad pad 简化） */
export interface PcbPad {
    id: string;
    number: string;
    type: PcbPadType;
    shape: PcbPadShape;
    /** 相对封装原点的局部坐标 (mil) */
    pos: Point2D;
    size: Point2D;
    drill?: number;
    layers: PcbLayerId[];
    netId?: string;
    netName?: string;
}
/** 封装定义（库内模板） */
export interface PcbFootprintDef {
    id: string;
    name: string;
    description: string;
    pads: PcbPad[];
    /** 丝印轮廓折线 (mil, 局部坐标) */
    silkLines: Point2D[][];
    courtyard: Point2D[];
    /** 可选 3D 高度 (mil)，缺省按封装类型估算 */
    heightMil?: number;
}
/** 板上封装实例 */
export interface PcbFootprintInst {
    id: string;
    defId: string;
    refDes: string;
    value: string;
    position: Point2D;
    rotation: Rotation;
    mirrored: boolean;
    layer: PcbLayerId;
    locked: boolean;
    /** 实例级焊盘（含网络绑定） */
    pads: PcbPad[];
    schematicCompId?: string;
}
/** 走线段 (KiCad segment) */
export interface PcbTrack {
    id: string;
    layer: PcbLayerId;
    start: Point2D;
    end: Point2D;
    width: number;
    netId: string;
    netName: string;
}
/** 过孔 */
export interface PcbVia {
    id: string;
    position: Point2D;
    drill: number;
    diameter: number;
    netId: string;
    netName: string;
    layers: PcbLayerId[];
    kind?: PcbViaKind;
}
/** 覆铜区（多边形 + 挖空 + 热焊盘） */
export interface PcbZone {
    id: string;
    layer: PcbLayerId;
    netId: string;
    netName: string;
    outline: Point2D[];
    priority: number;
    /** 异网焊盘间距 (mil) */
    clearance: number;
    /** 自动+手动挖空多边形列表 */
    cutouts: Point2D[][];
    /** 用户手动挖空（保留） */
    manualCutouts: Point2D[][];
    /** 同网焊盘热焊盘 */
    thermalRelief: boolean;
    thermalGap: number;
    thermalWidth: number;
}
/** 板框 */
export interface PcbBoardOutline {
    points: Point2D[];
    width: number;
}
export interface PcbLayerConfig {
    id: PcbLayerId;
    name: string;
    visible: boolean;
    color: string;
    userName?: string;
    opacity?: number;
}
export interface PcbNet {
    id: string;
    name: string;
    classId?: string;
}
export interface PcbNetClass {
    id: string;
    name: string;
    trackWidth: number;
    clearance: number;
    viaDiameter: number;
    viaDrill: number;
}
/** 差分对（长度/间距约束占位） */
export interface PcbDiffPair {
    id: string;
    name: string;
    netIdP: string;
    netIdN: string;
    gapMil: number;
    lengthTolMil: number;
}
export interface PcbStackLayer {
    id: string;
    type: PcbStackLayerType;
    name: string;
    /** 关联逻辑铜层（仅 copper） */
    copperLayerId?: PcbLayerId;
    thicknessMm: number;
    dielectricDk?: number;
    copperOz?: number;
}
export interface PcbLayerStack {
    copperCount: number;
    layers: PcbStackLayer[];
}
export interface PcbAppearance {
    mode: PcbAppearanceMode;
    dimAlpha: number;
    highlightNetId: string;
    hideZones: boolean;
    showRatsnest: boolean;
    showPadNumbers: boolean;
    show3d: boolean;
}
export interface PcbMetadata {
    author: string;
    createdAt: string;
    modifiedAt: string;
    description: string;
    gridSize: number;
    units: 'mil' | 'mm';
    designRules: PcbDesignRules;
}
export interface PcbDesignRules {
    minTrackWidth: number;
    minClearance: number;
    minViaDrill: number;
    defaultTrackWidth: number;
    minAnnularRing: number;
    minHoleToHole: number;
}
export interface PcbDocument {
    id: string;
    name: string;
    version: string;
    boardOutline: PcbBoardOutline;
    footprints: PcbFootprintInst[];
    tracks: PcbTrack[];
    vias: PcbVia[];
    zones: PcbZone[];
    layers: PcbLayerConfig[];
    nets: PcbNet[];
    netClasses: PcbNetClass[];
    layerStack: PcbLayerStack;
    diffPairs: PcbDiffPair[];
    metadata: PcbMetadata;
}
export enum PcbDrcSeverity {
    ERROR = "error",
    WARNING = "warning"
}
export enum PcbDrcRuleType {
    CLEARANCE = "clearance",
    UNROUTED_NET = "unrouted_net",
    OFF_BOARD = "off_board",
    SHORT = "short",
    MIN_WIDTH = "min_width",
    VIA_ANNULAR = "via_annular",
    PAD_CLEARANCE = "pad_clearance",
    DIFF_LENGTH = "diff_length",
    KEEPOUT = "keepout"
}
export interface PcbDrcViolation {
    id: string;
    severity: PcbDrcSeverity;
    ruleType: PcbDrcRuleType;
    message: string;
    position?: Point2D;
    netId?: string;
    footprintId?: string;
}
/** 飞线端点 */
export interface PcbRatsnestEdge {
    netId: string;
    netName: string;
    a: Point2D;
    b: Point2D;
}
export function defaultPcbDesignRules(): PcbDesignRules {
    return {
        minTrackWidth: 6,
        minClearance: 6,
        minViaDrill: 12,
        defaultTrackWidth: 10,
        minAnnularRing: 4,
        minHoleToHole: 10
    };
}
export function defaultPcbNetClasses(): PcbNetClass[] {
    return [
        {
            id: 'nc_default', name: 'Default',
            trackWidth: 10, clearance: 6, viaDiameter: 24, viaDrill: 12
        },
        {
            id: 'nc_power', name: 'Power',
            trackWidth: 20, clearance: 10, viaDiameter: 30, viaDrill: 16
        },
        {
            id: 'nc_signal', name: 'Signal',
            trackWidth: 8, clearance: 6, viaDiameter: 22, viaDrill: 12
        }
    ];
}
export function defaultPcbAppearance(): PcbAppearance {
    return {
        mode: PcbAppearanceMode.OVERLAY,
        dimAlpha: 0.28,
        highlightNetId: '',
        hideZones: false,
        showRatsnest: true,
        showPadNumbers: false,
        show3d: false
    };
}
export function createDefaultLayerStack(copperCount: number = 2): PcbLayerStack {
    const n = copperCount === 4 || copperCount === 6 || copperCount === 8 ? copperCount : 2;
    const layers: PcbStackLayer[] = [];
    layers.push({
        id: 'sm_top', type: PcbStackLayerType.SOLDERMASK, name: 'F.Mask', thicknessMm: 0.02
    });
    layers.push({
        id: 'cu_f', type: PcbStackLayerType.COPPER, name: 'F.Cu',
        copperLayerId: PcbLayerId.F_CU, thicknessMm: 0.035, copperOz: 1
    });
    if (n >= 4) {
        layers.push({
            id: 'diel_1', type: PcbStackLayerType.DIELECTRIC, name: 'Prepreg',
            thicknessMm: 0.2, dielectricDk: 4.5
        });
        layers.push({
            id: 'cu_in1', type: PcbStackLayerType.COPPER, name: 'In1.Cu',
            copperLayerId: PcbLayerId.IN1_CU, thicknessMm: 0.035, copperOz: 1
        });
        layers.push({
            id: 'diel_core', type: PcbStackLayerType.DIELECTRIC, name: 'Core',
            thicknessMm: 0.8, dielectricDk: 4.3
        });
        layers.push({
            id: 'cu_in2', type: PcbStackLayerType.COPPER, name: 'In2.Cu',
            copperLayerId: PcbLayerId.IN2_CU, thicknessMm: 0.035, copperOz: 1
        });
    }
    else {
        layers.push({
            id: 'diel_core', type: PcbStackLayerType.DIELECTRIC, name: 'Core',
            thicknessMm: 1.5, dielectricDk: 4.3
        });
    }
    if (n >= 6) {
        layers.push({
            id: 'diel_3', type: PcbStackLayerType.DIELECTRIC, name: 'Prepreg2',
            thicknessMm: 0.2, dielectricDk: 4.5
        });
        layers.push({
            id: 'cu_in3', type: PcbStackLayerType.COPPER, name: 'In3.Cu',
            copperLayerId: PcbLayerId.IN3_CU, thicknessMm: 0.035, copperOz: 1
        });
    }
    if (n >= 8) {
        layers.push({
            id: 'diel_4', type: PcbStackLayerType.DIELECTRIC, name: 'Prepreg3',
            thicknessMm: 0.2, dielectricDk: 4.5
        });
        layers.push({
            id: 'cu_in4', type: PcbStackLayerType.COPPER, name: 'In4.Cu',
            copperLayerId: PcbLayerId.IN4_CU, thicknessMm: 0.035, copperOz: 1
        });
    }
    if (n >= 6) {
        // ensure B.Cu after last inner for 6/8 — already handled below
    }
    layers.push({
        id: 'cu_b', type: PcbStackLayerType.COPPER, name: 'B.Cu',
        copperLayerId: PcbLayerId.B_CU, thicknessMm: 0.035, copperOz: 1
    });
    layers.push({
        id: 'sm_bot', type: PcbStackLayerType.SOLDERMASK, name: 'B.Mask', thicknessMm: 0.02
    });
    return { copperCount: n, layers };
}
export function createDefaultPcbLayers(copperCount: number = 2): PcbLayerConfig[] {
    const layers: PcbLayerConfig[] = [
        { id: PcbLayerId.F_CU, name: 'Front Copper', visible: true, color: '#C83434', opacity: 1 }
    ];
    if (copperCount >= 4) {
        layers.push({ id: PcbLayerId.IN1_CU, name: 'Inner1 Copper', visible: true, color: '#34C878', opacity: 1 });
        layers.push({ id: PcbLayerId.IN2_CU, name: 'Inner2 Copper', visible: true, color: '#C87834', opacity: 1 });
    }
    if (copperCount >= 6) {
        layers.push({ id: PcbLayerId.IN3_CU, name: 'Inner3 Copper', visible: true, color: '#7834C8', opacity: 1 });
    }
    if (copperCount >= 8) {
        layers.push({ id: PcbLayerId.IN4_CU, name: 'Inner4 Copper', visible: true, color: '#34C8C8', opacity: 1 });
    }
    layers.push({ id: PcbLayerId.B_CU, name: 'Back Copper', visible: true, color: '#3478C8', opacity: 1 });
    layers.push({ id: PcbLayerId.F_SILKS, name: 'Front Silk', visible: true, color: '#F0F0F0', opacity: 1 });
    layers.push({ id: PcbLayerId.B_SILKS, name: 'Back Silk', visible: false, color: '#C8C8C8', opacity: 1 });
    layers.push({ id: PcbLayerId.F_MASK, name: 'Front Mask', visible: false, color: '#2E8B57', opacity: 0.35 });
    layers.push({ id: PcbLayerId.B_MASK, name: 'Back Mask', visible: false, color: '#2E8B57', opacity: 0.35 });
    layers.push({ id: PcbLayerId.F_PASTE, name: 'Front Paste', visible: false, color: '#C0C0C0', opacity: 0.5 });
    layers.push({ id: PcbLayerId.B_PASTE, name: 'Back Paste', visible: false, color: '#A0A0A0', opacity: 0.5 });
    layers.push({ id: PcbLayerId.EDGE_CUTS, name: 'Edge Cuts', visible: true, color: '#FFD700', opacity: 1 });
    layers.push({ id: PcbLayerId.COURTYARD, name: 'Courtyard', visible: false, color: '#808080', opacity: 1 });
    return layers;
}
export function createEmptyPcbDocument(name: string): PcbDocument {
    const now = new Date().toISOString();
    const w = 3000;
    const h = 2000;
    return {
        id: `pcb_${Date.now()}`,
        name,
        version: '1.1',
        boardOutline: {
            points: [
                { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }
            ],
            width: 5
        },
        footprints: [],
        tracks: [],
        vias: [],
        zones: [],
        layers: createDefaultPcbLayers(2),
        nets: [],
        netClasses: defaultPcbNetClasses(),
        layerStack: createDefaultLayerStack(2),
        diffPairs: [],
        metadata: {
            author: '',
            createdAt: now,
            modifiedAt: now,
            description: '',
            gridSize: 5,
            units: 'mil',
            designRules: defaultPcbDesignRules()
        }
    };
}
export function createDefaultPcbViewport(): ViewportState {
    return {
        zoom: 0.15,
        panOffset: { x: 40, y: 40 },
        gridVisible: true,
        gridSize: 5,
        snapToGrid: true
    };
}
/** 铜层判定（含内层） */
export function isCopperLayer(layer: PcbLayerId): boolean {
    return layer === PcbLayerId.F_CU || layer === PcbLayerId.B_CU ||
        layer === PcbLayerId.IN1_CU || layer === PcbLayerId.IN2_CU ||
        layer === PcbLayerId.IN3_CU || layer === PcbLayerId.IN4_CU;
}
export function copperLayersFromStack(stack: PcbLayerStack): PcbLayerId[] {
    const out: PcbLayerId[] = [];
    for (const sl of stack.layers) {
        if (sl.type === PcbStackLayerType.COPPER && sl.copperLayerId) {
            out.push(sl.copperLayerId);
        }
    }
    return out;
}
/** 加载旧工程或残缺 JSON 时补齐 PCB 字段 */
export function normalizePcbDocument(doc: PcbDocument): void {
    if (!doc.footprints) {
        doc.footprints = [];
    }
    if (!doc.tracks) {
        doc.tracks = [];
    }
    if (!doc.vias) {
        doc.vias = [];
    }
    if (!doc.zones) {
        doc.zones = [];
    }
    if (!doc.nets) {
        doc.nets = [];
    }
    if (!doc.netClasses || doc.netClasses.length === 0) {
        doc.netClasses = defaultPcbNetClasses();
    }
    if (!doc.diffPairs) {
        doc.diffPairs = [];
    }
    if (!doc.layerStack || !doc.layerStack.layers || doc.layerStack.layers.length === 0) {
        doc.layerStack = createDefaultLayerStack(2);
    }
    for (const via of doc.vias) {
        if (!via.kind) {
            via.kind = PcbViaKind.THROUGH;
        }
        if (!via.layers || via.layers.length === 0) {
            via.layers = [PcbLayerId.F_CU, PcbLayerId.B_CU];
        }
    }
    for (const z of doc.zones) {
        if (!z.cutouts)
            z.cutouts = [];
        if (!z.manualCutouts)
            z.manualCutouts = [];
        if (z.clearance === undefined || z.clearance <= 0) {
            z.clearance = doc.metadata?.designRules?.minClearance ?? 6;
        }
        if (z.thermalRelief === undefined)
            z.thermalRelief = true;
        if (z.thermalGap === undefined || z.thermalGap <= 0)
            z.thermalGap = 12;
        if (z.thermalWidth === undefined || z.thermalWidth <= 0)
            z.thermalWidth = 10;
        if (z.priority === undefined)
            z.priority = 0;
    }
    if (!doc.layers || doc.layers.length === 0) {
        doc.layers = createDefaultPcbLayers(doc.layerStack.copperCount);
    }
    else {
        ensureLayerPresent(doc, PcbLayerId.F_MASK, 'Front Mask', '#2E8B57', false);
        ensureLayerPresent(doc, PcbLayerId.B_MASK, 'Back Mask', '#2E8B57', false);
        ensureLayerPresent(doc, PcbLayerId.F_PASTE, 'Front Paste', '#C0C0C0', false);
        ensureLayerPresent(doc, PcbLayerId.B_PASTE, 'Back Paste', '#A0A0A0', false);
        if (doc.layerStack.copperCount >= 4) {
            ensureLayerPresent(doc, PcbLayerId.IN1_CU, 'Inner1 Copper', '#34C878', true);
            ensureLayerPresent(doc, PcbLayerId.IN2_CU, 'Inner2 Copper', '#C87834', true);
        }
        if (doc.layerStack.copperCount >= 6) {
            ensureLayerPresent(doc, PcbLayerId.IN3_CU, 'Inner3 Copper', '#7834C8', true);
        }
        if (doc.layerStack.copperCount >= 8) {
            ensureLayerPresent(doc, PcbLayerId.IN4_CU, 'Inner4 Copper', '#34C8C8', true);
        }
    }
    if (!doc.boardOutline || !doc.boardOutline.points || doc.boardOutline.points.length < 3) {
        doc.boardOutline = {
            points: [
                { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }
            ],
            width: 5
        };
    }
    if (!doc.metadata) {
        const now = new Date().toISOString();
        doc.metadata = {
            author: '', createdAt: now, modifiedAt: now,
            description: '', gridSize: 5, units: 'mil',
            designRules: defaultPcbDesignRules()
        };
    }
    else {
        if (!doc.metadata.designRules) {
            doc.metadata.designRules = defaultPcbDesignRules();
        }
        else {
            const dr = doc.metadata.designRules;
            if (dr.minAnnularRing === undefined || dr.minAnnularRing <= 0)
                dr.minAnnularRing = 4;
            if (dr.minHoleToHole === undefined || dr.minHoleToHole <= 0)
                dr.minHoleToHole = 10;
        }
        if (!doc.metadata.gridSize || doc.metadata.gridSize <= 0) {
            doc.metadata.gridSize = 5;
        }
    }
}
function ensureLayerPresent(doc: PcbDocument, id: PcbLayerId, name: string, color: string, visible: boolean): void {
    for (const l of doc.layers) {
        if (l.id === id)
            return;
    }
    doc.layers.push({ id, name, visible, color, opacity: 1 });
}
/** 将铜层数切换为 2/4/6/8，同步 layers + layerStack */
export function applyCopperLayerCount(doc: PcbDocument, copperCount: number): void {
    const n = copperCount === 4 || copperCount === 6 || copperCount === 8 ? copperCount : 2;
    doc.layerStack = createDefaultLayerStack(n);
    const visibility: Map<string, boolean> = new Map();
    for (const l of doc.layers) {
        visibility.set(l.id, l.visible);
    }
    doc.layers = createDefaultPcbLayers(n);
    for (const l of doc.layers) {
        const prev = visibility.get(l.id);
        if (prev !== undefined) {
            l.visible = prev;
        }
    }
}
/** PCB 网络引用（走线/焊盘绑定） */
export interface PcbNetRef {
    netId: string;
    netName: string;
}
/** 焊盘网络保留（封装刷新时） */
export interface PcbPadNetPreserved {
    netId?: string;
    netName?: string;
}
/** 焊盘命中测试结果 */
export interface PcbPadHit {
    pad: PcbPad;
    wx: number;
    wy: number;
}
/** PCB 编辑器选择事件载荷 */
export class PcbEditorSelectionData {
    footprintIds: string[] = [];
    trackIds: string[] = [];
    viaIds: string[] = [];
    zoneIds: string[] = [];
}
/** 统一选择状态 */
export enum PcbSelectionKind {
    NONE = "none",
    FOOTPRINT = "footprint",
    TRACK = "track",
    VIA = "via",
    ZONE = "zone",
    MULTI = "multi"
}
export interface PcbSelectionState {
    kind: PcbSelectionKind;
    footprintIds: string[];
    trackIds: string[];
    viaIds: string[];
    zoneIds: string[];
}
export function pcbSelectionEmpty(): PcbSelectionState {
    return { kind: PcbSelectionKind.NONE, footprintIds: [], trackIds: [], viaIds: [], zoneIds: [] };
}
export function pcbSelectionFromData(d: PcbEditorSelectionData): PcbSelectionState {
    let kind = PcbSelectionKind.NONE;
    if (d.footprintIds.length > 0)
        kind = PcbSelectionKind.FOOTPRINT;
    else if (d.trackIds.length > 0)
        kind = PcbSelectionKind.TRACK;
    else if (d.viaIds.length > 0)
        kind = PcbSelectionKind.VIA;
    else if (d.zoneIds.length > 0)
        kind = PcbSelectionKind.ZONE;
    const total = d.footprintIds.length + d.trackIds.length + d.viaIds.length + d.zoneIds.length;
    if (total > 1)
        kind = PcbSelectionKind.MULTI;
    return {
        kind,
        footprintIds: [...d.footprintIds],
        trackIds: [...d.trackIds],
        viaIds: [...d.viaIds],
        zoneIds: [...d.zoneIds]
    };
}
/** 框选矩形（世界坐标） */
export interface PcbSelectionRect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** 撤销/重做历史快照 */
export interface PcbHistorySnapshot {
    documentJson: string;
    selection: PcbSelectionState;
}
