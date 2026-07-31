import type { Point2D, Rotation, ViewportState } from './CommonTypes';
/** KiCad 风格图层 ID（含内层铜 / 钢网） */
export enum PcbLayerId {
    F_CU = "F.Cu",
    IN1_CU = "In1.Cu",
    IN2_CU = "In2.Cu",
    IN3_CU = "In3.Cu",
    IN4_CU = "In4.Cu",
    IN5_CU = "In5.Cu",
    IN6_CU = "In6.Cu",
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
/** 3D 显示模式（Canvas 近似：透视半透明 / 爆炸 / 剖切 / 高度色阶） */
export enum Pcb3dDisplayMode {
    REALISTIC = "realistic",
    XRAY = "xray",
    EXPLODE = "explode",
    CUTAWAY = "cutaway",
    HEIGHTMAP = "heightmap"
}
export enum PcbAppearanceMode {
    OVERLAY = "overlay",
    ACTIVE_ONLY = "active_only",
    DIM_INACTIVE = "dim_inactive"
}
/** 布线拐角模式 */
export enum PcbRouteCornerMode {
    ORTHO90 = "ortho90",
    ORTHO45 = "ortho45",
    ARC = "arc"
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
    /** 绑定的 STEP 模型 id（可选） */
    model3dId?: string;
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
    /** 3D 绕竖直轴偏航角（度），左键拖拽旋转 */
    view3dYawDeg: number;
    /** 3D 俯仰角（度），约 15–85，避免翻转 */
    view3dPitchDeg: number;
    /** 3D 正交投影（工业默认）；false=透视 */
    view3dOrtho: boolean;
    /** 3D 显示模式 */
    view3dDisplayMode: Pcb3dDisplayMode;
    /** 剖切比例 0~1（沿板框 X 方向） */
    view3dCutFraction: number;
    /** 3D 测量模式：点击两点测距 */
    view3dMeasure: boolean;
    /** 显示元件干涉预警 */
    view3dShowInterference: boolean;
    /** 真 PBR+IBL+MSAA（写实模式） */
    view3dPbr: boolean;
    /** MSAA 样本：1 或 4 */
    view3dMsaa: number;
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
    /** 丝印最小字高 (mil)，约 0.8mm ≈ 31mil */
    minSilkHeight: number;
    /** 丝印距焊盘最小间距 (mil)，约 0.2mm ≈ 8mil */
    silkToPadClearance: number;
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
    DIFF_GAP = "diff_gap",
    KEEPOUT = "keepout",
    SILK_PAD = "silk_pad",
    SILK_HEIGHT = "silk_height",
    EDGE_OPEN = "edge_open"
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
        minHoleToHole: 10,
        minSilkHeight: 31,
        silkToPadClearance: 8
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
        showRatsnest: false,
        showPadNumbers: true,
        show3d: false,
        view3dYawDeg: 38,
        view3dPitchDeg: 52,
        view3dOrtho: true,
        view3dDisplayMode: Pcb3dDisplayMode.REALISTIC,
        view3dCutFraction: 0.55,
        view3dMeasure: false,
        view3dShowInterference: false,
        // 默认伪 3D：全量软件 PBR 易在模拟器主线程卡死（THREAD_BLOCK_6S）
        view3dPbr: false,
        view3dMsaa: 1
    };
}
/** 合并残缺 appearance，避免旧会话缺字段崩溃 */
export function normalizePcbAppearance(ap: PcbAppearance | null | undefined): PcbAppearance {
    const d = defaultPcbAppearance();
    if (ap === null || ap === undefined) {
        return d;
    }
    return {
        mode: ap.mode !== undefined ? ap.mode : d.mode,
        dimAlpha: ap.dimAlpha !== undefined && ap.dimAlpha >= 0 ? ap.dimAlpha : d.dimAlpha,
        highlightNetId: ap.highlightNetId !== undefined ? ap.highlightNetId : d.highlightNetId,
        hideZones: ap.hideZones === true,
        showRatsnest: ap.showRatsnest === true,
        showPadNumbers: ap.showPadNumbers !== false,
        show3d: ap.show3d === true,
        view3dYawDeg: ap.view3dYawDeg !== undefined ? ap.view3dYawDeg : d.view3dYawDeg,
        view3dPitchDeg: ap.view3dPitchDeg !== undefined ? ap.view3dPitchDeg : d.view3dPitchDeg,
        view3dOrtho: ap.view3dOrtho !== false,
        view3dDisplayMode: ap.view3dDisplayMode !== undefined ? ap.view3dDisplayMode : d.view3dDisplayMode,
        view3dCutFraction: ap.view3dCutFraction !== undefined ? ap.view3dCutFraction : d.view3dCutFraction,
        view3dMeasure: ap.view3dMeasure === true,
        view3dShowInterference: ap.view3dShowInterference === true,
        view3dPbr: ap.view3dPbr === true,
        view3dMsaa: ap.view3dMsaa >= 4 ? 4 : 1
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
        layers.push({
            id: 'diel_3b', type: PcbStackLayerType.DIELECTRIC, name: 'Prepreg2b',
            thicknessMm: 0.2, dielectricDk: 4.5
        });
        layers.push({
            id: 'cu_in4', type: PcbStackLayerType.COPPER, name: 'In4.Cu',
            copperLayerId: PcbLayerId.IN4_CU, thicknessMm: 0.035, copperOz: 1
        });
    }
    if (n >= 8) {
        layers.push({
            id: 'diel_4', type: PcbStackLayerType.DIELECTRIC, name: 'Prepreg3',
            thicknessMm: 0.2, dielectricDk: 4.5
        });
        layers.push({
            id: 'cu_in5', type: PcbStackLayerType.COPPER, name: 'In5.Cu',
            copperLayerId: PcbLayerId.IN5_CU, thicknessMm: 0.035, copperOz: 1
        });
        layers.push({
            id: 'diel_4b', type: PcbStackLayerType.DIELECTRIC, name: 'Prepreg3b',
            thicknessMm: 0.2, dielectricDk: 4.5
        });
        layers.push({
            id: 'cu_in6', type: PcbStackLayerType.COPPER, name: 'In6.Cu',
            copperLayerId: PcbLayerId.IN6_CU, thicknessMm: 0.035, copperOz: 1
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
        { id: PcbLayerId.F_CU, name: 'Front Copper', visible: true, color: '#FF1744', opacity: 0.95 }
    ];
    if (copperCount >= 4) {
        layers.push({ id: PcbLayerId.IN1_CU, name: 'Inner1 Copper', visible: true, color: '#D500F9', opacity: 0.88 });
        layers.push({ id: PcbLayerId.IN2_CU, name: 'Inner2 Copper', visible: true, color: '#FF9100', opacity: 0.88 });
    }
    if (copperCount >= 6) {
        layers.push({ id: PcbLayerId.IN3_CU, name: 'Inner3 Copper', visible: true, color: '#651FFF', opacity: 0.85 });
        layers.push({ id: PcbLayerId.IN4_CU, name: 'Inner4 Copper', visible: true, color: '#00E5FF', opacity: 0.85 });
    }
    if (copperCount >= 8) {
        layers.push({ id: PcbLayerId.IN5_CU, name: 'Inner5 Copper', visible: true, color: '#FFD740', opacity: 0.85 });
        layers.push({ id: PcbLayerId.IN6_CU, name: 'Inner6 Copper', visible: true, color: '#69F0AE', opacity: 0.85 });
    }
    layers.push({ id: PcbLayerId.B_CU, name: 'Back Copper', visible: true, color: '#00E676', opacity: 0.92 });
    layers.push({ id: PcbLayerId.F_SILKS, name: 'Front Silk', visible: true, color: '#5CE1E6', opacity: 1 });
    layers.push({ id: PcbLayerId.B_SILKS, name: 'Back Silk', visible: false, color: '#80A0B0', opacity: 1 });
    layers.push({ id: PcbLayerId.F_MASK, name: 'Front Mask', visible: false, color: '#1B5E20', opacity: 0.35 });
    layers.push({ id: PcbLayerId.B_MASK, name: 'Back Mask', visible: false, color: '#1B5E20', opacity: 0.35 });
    layers.push({ id: PcbLayerId.F_PASTE, name: 'Front Paste', visible: false, color: '#C0C0C0', opacity: 0.5 });
    layers.push({ id: PcbLayerId.B_PASTE, name: 'Back Paste', visible: false, color: '#A0A0A0', opacity: 0.5 });
    layers.push({ id: PcbLayerId.EDGE_CUTS, name: 'Edge Cuts', visible: true, color: '#E8A020', opacity: 1 });
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
        layer === PcbLayerId.IN3_CU || layer === PcbLayerId.IN4_CU ||
        layer === PcbLayerId.IN5_CU || layer === PcbLayerId.IN6_CU;
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
        if (z.netName === undefined || z.netName === null) {
            z.netName = '';
        }
        if (z.netId === undefined || z.netId === null) {
            z.netId = '';
        }
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
    for (const fp of doc.footprints) {
        if (!fp.pads)
            fp.pads = [];
        for (const pad of fp.pads) {
            if (!pad.layers || pad.layers.length === 0) {
                if (pad.type === PcbPadType.SMD) {
                    pad.layers = [fp.layer === PcbLayerId.B_CU ? PcbLayerId.B_CU : PcbLayerId.F_CU];
                }
                else {
                    pad.layers = [PcbLayerId.F_CU, PcbLayerId.B_CU];
                }
            }
            if (pad.netName === undefined || pad.netName === null) {
                pad.netName = '';
            }
            if (pad.netId === undefined || pad.netId === null) {
                pad.netId = '';
            }
        }
    }
    for (const trk of doc.tracks) {
        if (trk.netName === undefined || trk.netName === null)
            trk.netName = '';
        if (trk.netId === undefined || trk.netId === null)
            trk.netId = '';
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
            ensureLayerPresent(doc, PcbLayerId.IN1_CU, 'Inner1 Copper', '#D500F9', true);
            ensureLayerPresent(doc, PcbLayerId.IN2_CU, 'Inner2 Copper', '#FF9100', true);
        }
        if (doc.layerStack.copperCount >= 6) {
            ensureLayerPresent(doc, PcbLayerId.IN3_CU, 'Inner3 Copper', '#651FFF', true);
            ensureLayerPresent(doc, PcbLayerId.IN4_CU, 'Inner4 Copper', '#00E5FF', true);
        }
        if (doc.layerStack.copperCount >= 8) {
            ensureLayerPresent(doc, PcbLayerId.IN5_CU, 'Inner5 Copper', '#FFD740', true);
            ensureLayerPresent(doc, PcbLayerId.IN6_CU, 'Inner6 Copper', '#69F0AE', true);
        }
        applyDistinctCopperColors(doc);
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
            if (dr.minSilkHeight === undefined || dr.minSilkHeight <= 0)
                dr.minSilkHeight = 31;
            if (dr.silkToPadClearance === undefined || dr.silkToPadClearance <= 0)
                dr.silkToPadClearance = 8;
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
/** 统一铜层高对比分色，保证全层可见时一眼可辨 */
function applyDistinctCopperColors(doc: PcbDocument): void {
    for (let i = 0; i < doc.layers.length; i++) {
        const l = doc.layers[i];
        let c = '';
        if (l.id === PcbLayerId.F_CU)
            c = '#FF1744';
        else if (l.id === PcbLayerId.B_CU)
            c = '#00E676';
        else if (l.id === PcbLayerId.IN1_CU)
            c = '#D500F9';
        else if (l.id === PcbLayerId.IN2_CU)
            c = '#FF9100';
        else if (l.id === PcbLayerId.IN3_CU)
            c = '#651FFF';
        else if (l.id === PcbLayerId.IN4_CU)
            c = '#00E5FF';
        else if (l.id === PcbLayerId.IN5_CU)
            c = '#FFD740';
        else if (l.id === PcbLayerId.IN6_CU)
            c = '#69F0AE';
        if (c.length > 0) {
            l.color = c;
            const op = l.opacity !== undefined ? l.opacity : 1;
            if (op < 0.75) {
                l.opacity = l.id === PcbLayerId.F_CU || l.id === PcbLayerId.B_CU ? 0.92 : 0.85;
            }
        }
    }
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
