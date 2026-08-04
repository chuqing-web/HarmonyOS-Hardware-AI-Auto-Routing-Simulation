import { PcbLayerId, PcbPadType, copperLayersFromStack, getGlobalPcbFootprintLibrary, Pcb3dDisplayMode, PcbViaKind, PcbAppearanceMode, isCopperLayer, padWorldPosition, buildTrackPolylines, tracePcb3d } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbFootprintInst, PcbTrack, Point2D, PcbTrackPolyline } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { copperOrderOf, copperWorldZ, copperLayerNormZ, viaZSpan, boardBoundsX, isCutAway, detectInterference, heightHeatColor, hitTest3d, milToMm, dist3, boardThicknessWorld, isBottomSideCopper } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
import type { Pcb3dInterference, Pcb3dHit } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
import { Pcb3dMeshBuilder } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dMeshBuilder";
import { Pcb3dPbrRaster } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dPbrRaster";
import { getBoundStepSig } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/PcbStepImporter";
/** 材质颜色（Canvas painter 路径，工业可视化优化） */
export class Mat3d {
    // 阻焊：经典绿色系，更高饱和度
    static readonly MASK = '#0B7A3E';
    static readonly MASK_LIT = '#18A855';
    static readonly MASK_DIM = '#065A2A';
    static readonly MASK_TOP = '#0D8C46';
    static readonly MASK_TOP_LIT = '#1EB860';
    // FR4 侧边：暖棕
    static readonly FR4_EDGE = '#9B8460';
    static readonly FR4_EDGE_LIT = '#B8A078';
    static readonly FR4_EDGE_DIM = '#786545';
    // 铜箔：暖铜色
    static readonly COPPER = '#C47A3A';
    static readonly COPPER_LIT = '#E0A855';
    static readonly COPPER_HI = '#F5E080';
    static readonly COPPER_DIM = '#8B5528';
    // ENIG 金
    static readonly ENIG = '#F0D050';
    static readonly ENIG_LIT = '#FCE890';
    // HASL 锡
    static readonly HASL = '#C8C8C8';
    static readonly HASL_LIT = '#E8E8E8';
    // 沉铜孔壁（金黄，与焊盘一致）
    static readonly BARREL = '#E0C040';
    static readonly BARREL_LIT = '#F8E878';
    // 丝印
    static readonly SILK = '#F8F8F8';
    // 塑封
    static readonly PLASTIC = '#1E1E24';
    static readonly PLASTIC_LIT = '#363640';
    static readonly PLASTIC_TOP = '#2A2A32';
    // 陶瓷
    static readonly CERAMIC = '#ECD8A0';
    static readonly CERAMIC_LIT = '#F8ECC8';
    // 引脚
    static readonly PIN = '#D4D4D8';
    static readonly PIN_HI = '#F4F4F8';
    static readonly NPTH = '#786545';
}
export interface Pcb3dViewParams {
    viewWidth: number;
    viewHeight: number;
    zoom: number;
    panX: number;
    panY: number;
    yawDeg: number;
    pitchDeg: number;
    /** 正交投影（工业默认）；false=透视 */
    ortho: boolean;
    highlightNetId: string;
    dimAlpha: number;
    hideZones: boolean;
    selectedFpIds: string[];
    selectedTrackIds: string[];
    selectedViaIds: string[];
    displayMode: Pcb3dDisplayMode;
    cutFraction: number;
    measurePts: Point2D[];
    showInterference: boolean;
    /** 启用真 PBR+IBL+MSAA 光栅（写实默认开） */
    usePbr: boolean;
    msaa: number;
    /** 活动铜层：ACTIVE_ONLY 时只看该层连线 */
    activeLayer: PcbLayerId;
    /** overlay=全层可见分色 / active_only=只看活动层 / dim_inactive=淡化非活动层 */
    appearanceMode: PcbAppearanceMode;
}
interface PolyDraw {
    poly: PcbTrackPolyline;
    depth: number;
}
interface ViaDraw {
    x: number;
    y: number;
    outerR: number;
    drillR: number;
    plated: boolean;
    depth: number;
    netId: string;
    id: string;
    zBot: number;
    zTop: number;
    kind: PcbViaKind;
}
interface FpDraw {
    fp: PcbFootprintInst;
    depth: number;
    hw: number;
    hh: number;
    zBase: number;
    bodyH: number;
    kind: string;
    selected: boolean;
    libId: string;
}
type ProjectFn = (wx: number, wy: number, wz: number) => Point2D;
function isLayerVis(doc: PcbDocument, layer: PcbLayerId): boolean {
    for (let i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === layer)
            return doc.layers[i].visible;
    }
    return true;
}
/** 3D 铜层：外观模式 + 图层面板显隐 + 透明度（≤5% 视为关闭） */
function copperDrawOk(doc: PcbDocument, layer: PcbLayerId, p: Pcb3dViewParams): boolean {
    if (!isCopperLayer(layer))
        return isLayerVis(doc, layer) && layerOpacity(doc, layer) > 0.05;
    if (!isLayerVis(doc, layer))
        return false;
    if (layerOpacity(doc, layer) <= 0.05)
        return false;
    return copperLayerFocusOk(layer, p);
}
function layerOpacity(doc: PcbDocument, layer: PcbLayerId): number {
    for (let i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === layer) {
            const o = doc.layers[i].opacity;
            return o !== undefined && o >= 0 ? Math.max(0, Math.min(1, o)) : 1;
        }
    }
    return 1;
}
/**
 * 器件 3D 视觉分类 — 覆盖全部 82 种内置 libraryId。
 * 返回渲染类别，用于选择专用绘制方法。
 */
function fpKind(defId: string, refDes: string, value: string, libId?: string): string {
    // --- defId 精确匹配（从封装库直接识别）---
    if (defId === 'FP_MOUNT' || refDes.startsWith('H'))
        return 'mount';
    if (defId.indexOf('PINHDR') >= 0 || (refDes.startsWith('J') && defId.indexOf('FP_') >= 0))
        return 'header';
    // TO 系列
    if (defId.indexOf('TO220') >= 0)
        return 'to220';
    if (defId.indexOf('TO92_SENSOR') >= 0)
        return 'sensor_to92';
    if (defId.indexOf('TO92') >= 0)
        return 'bjt';
    // IC 系列
    if (defId.indexOf('DIP') >= 0)
        return 'ic';
    if (defId.indexOf('SOIC') >= 0 || defId.indexOf('SOP') >= 0)
        return 'ic';
    if (defId.indexOf('QFP') >= 0 || defId.indexOf('TSSOP') >= 0)
        return 'ic';
    if (defId.indexOf('SOT') >= 0)
        return 'sot';
    // 分立器件
    if (defId.indexOf('LED') >= 0)
        return 'led';
    if (defId.indexOf('AXIAL_DIODE') >= 0)
        return 'diode';
    if (defId.indexOf('AXIAL_IND') >= 0)
        return 'ind';
    if (defId.indexOf('AXIAL') >= 0 && refDes.startsWith('D'))
        return 'diode';
    if (defId.indexOf('FUSE') >= 0)
        return 'fuse';
    // 电容
    if (defId.indexOf('RADIAL_CAP') >= 0 || defId.indexOf('RADIAL') >= 0)
        return 'elec';
    if (defId.indexOf('ELEC') >= 0 || defId.indexOf('CP_') >= 0)
        return 'elec';
    // 机电
    if (defId.indexOf('POT') >= 0)
        return 'pot';
    if (defId.indexOf('XTAL') >= 0)
        return 'xtal';
    if (defId.indexOf('SW_') >= 0)
        return 'switch';
    if (defId.indexOf('RELAY') >= 0)
        return 'relay';
    if (defId.indexOf('BUZZER') >= 0)
        return 'buzzer';
    // 显示
    if (defId.indexOf('LCD') >= 0)
        return 'lcd';
    if (defId.indexOf('OLED') >= 0)
        return 'oled';
    // 传感器 / 仪器
    if (defId.indexOf('LDR') >= 0)
        return 'ldr';
    if (defId.indexOf('INSTRUMENT') >= 0 || defId.indexOf('INSTR_') >= 0)
        return 'instrument';
    // 端子
    if (defId.indexOf('TERMINAL') >= 0)
        return 'terminal';
    // THT 通用
    if (defId.indexOf('THT2') >= 0 || defId.indexOf('THT_2') >= 0)
        return 'tht';
    // --- libraryId 回退匹配 ---
    const id = (libId ?? '').toUpperCase();
    const vu = (value ?? '').toUpperCase();
    if (id.startsWith('POT_'))
        return 'pot';
    if (id.startsWith('XTAL_'))
        return 'xtal';
    if (id.startsWith('FUSE_'))
        return 'fuse';
    if (id.startsWith('LED_'))
        return 'led';
    if (id === '1N4148' || id === '1N4007' || id === '1N5819')
        return 'diode';
    if (id === '2N2222' || id === '2N2907')
        return 'bjt';
    if (id === '2N7000' || id === 'IRF540')
        return 'mosfet';
    if (id.startsWith('L_'))
        return 'ind';
    if (refDes.startsWith('C') && (vu.indexOf('UF') >= 0 || id === 'C_10UF' || id === 'C_100UF'))
        return 'elec';
    if (id === 'SW_PUSH')
        return 'switch';
    if (id.startsWith('RELAY_'))
        return 'relay';
    if (id === 'BUZZER')
        return 'buzzer';
    if (id === 'LCD1602' || id.startsWith('LCD'))
        return 'lcd';
    if (id === 'OLED_12864' || id.startsWith('OLED'))
        return 'oled';
    if (id === 'DS18B20')
        return 'sensor_to92';
    if (id === 'HALL_SENSOR')
        return 'sensor_sip';
    if (id === 'LDR')
        return 'ldr';
    if (id === 'OSCILLOSCOPE' || id === 'VIRTUAL_METER' || id === 'VOLTMETER_DC' ||
        id === 'AMMETER_DC' || id === 'POWER_METER' || id === 'FREQ_COUNTER' ||
        id === 'LOGIC_ANALYZER' || id === 'UART_TERMINAL')
        return 'instrument';
    if (id === 'AT89C51' || id === 'AT89C52' || id === 'STC89C52' ||
        id === 'STC15W408AS' || id.startsWith('STM32'))
        return 'ic';
    if (id === '2764' || id === '62256' || id === '24C02' || id === 'W25Q64')
        return 'ic';
    if (id.startsWith('74HC') || id === 'CD4017')
        return 'ic';
    if (id === 'UA741' || id === 'LM358' || id === 'TL082' || id === 'LM555')
        return 'ic';
    if (id === 'LM7805' || id === 'LM7812' || id === 'AMS1117_3V3' || id === 'LM2596')
        return 'to220';
    if (id === 'VCC' || id === 'GND' || id === 'VEE' || id === 'VAC' || id === 'SIGNAL_GEN')
        return 'terminal';
    // --- SMD 片式（尺寸分类）---
    const smdChip = defId.indexOf('0805') >= 0 || defId.indexOf('0603') >= 0 ||
        defId.indexOf('1206') >= 0 || defId.indexOf('0402') >= 0 || defId.indexOf('2512') >= 0;
    if (smdChip) {
        if (refDes.startsWith('R') || refDes.startsWith('F'))
            return 'res';
        if (refDes.startsWith('C'))
            return 'cap';
        if (refDes.startsWith('L'))
            return 'ind';
        if (refDes.startsWith('D'))
            return 'diode';
        return 'smd';
    }
    if (refDes.startsWith('C'))
        return 'cap';
    if (refDes.startsWith('R') || refDes.startsWith('F'))
        return 'res';
    if (refDes.startsWith('D') || refDes.startsWith('Z'))
        return 'diode';
    if (refDes.startsWith('Q'))
        return 'bjt';
    if (refDes.startsWith('L'))
        return 'ind';
    if (refDes.startsWith('P') || refDes.startsWith('VR'))
        return 'pot';
    return 'smd';
}
function bodyHeight(kind: string, zoom: number, lodFar: boolean): number {
    const z = Math.min(zoom, 1.2);
    const k = lodFar ? 0.72 : 1;
    if (kind === 'mount')
        return 0;
    if (kind === 'header')
        return Math.max(50, 64 * z) * k;
    if (kind === 'ic')
        return Math.max(18, 26 * z) * k;
    if (kind === 'to220')
        return Math.max(30, 42 * z) * k;
    if (kind === 'sot')
        return Math.max(11, 16 * z) * k;
    if (kind === 'tht')
        return Math.max(20, 28 * z) * k;
    if (kind === 'elec')
        return Math.max(40, 56 * z) * k;
    if (kind === 'pot')
        return Math.max(22, 30 * z) * k;
    if (kind === 'xtal')
        return Math.max(16, 22 * z) * k;
    if (kind === 'fuse')
        return Math.max(10, 14 * z) * k;
    if (kind === 'led')
        return Math.max(14, 20 * z) * k;
    if (kind === 'diode')
        return Math.max(12, 16 * z) * k;
    if (kind === 'bjt')
        return Math.max(14, 18 * z) * k;
    if (kind === 'mosfet')
        return Math.max(16, 20 * z) * k;
    if (kind === 'ind')
        return Math.max(9, 13 * z) * k;
    if (kind === 'switch')
        return Math.max(18, 24 * z) * k;
    if (kind === 'relay')
        return Math.max(28, 36 * z) * k;
    if (kind === 'buzzer')
        return Math.max(22, 28 * z) * k;
    if (kind === 'lcd')
        return Math.max(32, 40 * z) * k;
    if (kind === 'oled')
        return Math.max(6, 9 * z) * k;
    if (kind === 'sensor_to92' || kind === 'sensor_sip')
        return Math.max(16, 20 * z) * k;
    if (kind === 'ldr')
        return Math.max(14, 18 * z) * k;
    if (kind === 'instrument')
        return Math.max(26, 34 * z) * k;
    if (kind === 'terminal')
        return Math.max(14, 20 * z) * k;
    if (kind === 'cap')
        return Math.max(10, 14 * z) * k;
    if (kind === 'res')
        return Math.max(8, 11 * z) * k;
    return Math.max(8, 12 * z) * k;
}
function localRot(lx: number, ly: number, fp: PcbFootprintInst): Point2D {
    let x = lx;
    let y = ly;
    if (fp.mirrored)
        x = -x;
    if (fp.rotation === 90) {
        const t = x;
        x = -y;
        y = t;
    }
    else if (fp.rotation === 180) {
        x = -x;
        y = -y;
    }
    else if (fp.rotation === 270) {
        const t = x;
        x = y;
        y = -t;
    }
    return { x: fp.position.x + x, y: fp.position.y + y };
}
/** Harmony Canvas 不吃 #RRGGBBAA，必须用 rgba()，否则透明度失效、颜色串色 */
function hexAlpha(hex: string, a: number): string {
    const alpha = Math.max(0, Math.min(1, a));
    if (hex.startsWith('#') && (hex.length === 7 || hex.length === 9)) {
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);
        if (!(r >= 0) || !(g >= 0) || !(b >= 0)) {
            return `rgba(128,128,128,${alpha.toFixed(3)})`;
        }
        return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    }
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
        return hex;
    }
    return `rgba(128,128,128,${alpha.toFixed(3)})`;
}
function layerColor(doc: PcbDocument, layer: PcbLayerId): string {
    for (let i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === layer)
            return doc.layers[i].color;
    }
    // 高对比分色：暗色背景友好
    if (layer === PcbLayerId.F_CU)
        return '#E84040';
    if (layer === PcbLayerId.B_CU)
        return '#30D880';
    if (layer === PcbLayerId.IN1_CU)
        return '#D060F0';
    if (layer === PcbLayerId.IN2_CU)
        return '#F09830';
    if (layer === PcbLayerId.IN3_CU)
        return '#8858FF';
    if (layer === PcbLayerId.IN4_CU)
        return '#30D8F8';
    if (layer === PcbLayerId.IN5_CU)
        return '#FFD740';
    if (layer === PcbLayerId.IN6_CU)
        return '#69F0AE';
    return Mat3d.COPPER;
}
/** 仅「单层」ACTIVE_ONLY 且活动层为铜时过滤；丝印/阻焊绝不藏铜 */
function copperLayerFocusOk(layer: PcbLayerId, p: Pcb3dViewParams): boolean {
    if (!isCopperLayer(layer))
        return true;
    if (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY) {
        if (!isCopperLayer(p.activeLayer))
            return true;
        return layer === p.activeLayer;
    }
    return true;
}
/** 点选铜层时另一面明显淡化（≤18%） */
function copperLayerDimFactor(layer: PcbLayerId, p: Pcb3dViewParams): number {
    if (p.appearanceMode === PcbAppearanceMode.DIM_INACTIVE &&
        isCopperLayer(p.activeLayer) && isCopperLayer(layer) && layer !== p.activeLayer) {
        return 0.16;
    }
    return 1;
}
function layerDisplayName(doc: PcbDocument, layer: PcbLayerId): string {
    for (let i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === layer)
            return doc.layers[i].name;
    }
    return layer;
}
function displayModeLabel(mode: Pcb3dDisplayMode): string {
    if (mode === Pcb3dDisplayMode.XRAY)
        return '半透明';
    if (mode === Pcb3dDisplayMode.EXPLODE)
        return '爆炸';
    if (mode === Pcb3dDisplayMode.CUTAWAY)
        return '剖切';
    if (mode === Pcb3dDisplayMode.HEIGHTMAP)
        return '高度色阶';
    return '写实';
}
function boardBoundsY(doc: PcbDocument): Point2D {
    const outline = doc.boardOutline.points;
    if (outline.length === 0)
        return { x: 0, y: 0 };
    let minY = outline[0].y;
    let maxY = outline[0].y;
    for (let i = 1; i < outline.length; i++) {
        minY = Math.min(minY, outline[i].y);
        maxY = Math.max(maxY, outline[i].y);
    }
    return { x: minY, y: maxY };
}
function boardBoundsX_simple(outline: Point2D[]): Point2D {
    if (outline.length === 0)
        return { x: 0, y: 0 };
    let mn = outline[0].x;
    let mx = outline[0].x;
    for (let i = 1; i < outline.length; i++) {
        mn = Math.min(mn, outline[i].x);
        mx = Math.max(mx, outline[i].x);
    }
    return { x: mn, y: mx };
}
function boardBoundsY_simple(outline: Point2D[]): Point2D {
    if (outline.length === 0)
        return { x: 0, y: 0 };
    let mn = outline[0].y;
    let mx = outline[0].y;
    for (let i = 1; i < outline.length; i++) {
        mn = Math.min(mn, outline[i].y);
        mx = Math.max(mx, outline[i].y);
    }
    return { x: mn, y: mx };
}
function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
    // 折线近似椭圆：Harmony 上比 scale+arc / bezier 更稳
    const rxSafe = Math.max(rx, 0.01);
    const rySafe = Math.max(ry, 0.01);
    const n = 28;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = cx + Math.cos(a) * rxSafe;
        const py = cy + Math.sin(a) * rySafe;
        if (i === 0)
            ctx.moveTo(px, py);
        else
            ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
}
function strokeEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
    const rxSafe = Math.max(rx, 0.01);
    const rySafe = Math.max(ry, 0.01);
    const n = 28;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = cx + Math.cos(a) * rxSafe;
        const py = cy + Math.sin(a) * rySafe;
        if (i === 0)
            ctx.moveTo(px, py);
        else
            ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
}
function fillBoardQuad(ctx: CanvasRenderingContext2D, project: ProjectFn, fp: PcbFootprintInst, lx0: number, ly0: number, lx1: number, ly1: number, z: number, fill: string, stroke?: string): void {
    const c00 = localRot(lx0, ly0, fp);
    const c10 = localRot(lx1, ly0, fp);
    const c11 = localRot(lx1, ly1, fp);
    const c01 = localRot(lx0, ly1, fp);
    const p00 = project(c00.x, c00.y, z);
    const p10 = project(c10.x, c10.y, z);
    const p11 = project(c11.x, c11.y, z);
    const p01 = project(c01.x, c01.y, z);
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p01.x, p01.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke !== undefined && stroke.length > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
function drawExtrudedBox(ctx: CanvasRenderingContext2D, project: ProjectFn, fp: PcbFootprintInst, lx0: number, ly0: number, lx1: number, ly1: number, z0: number, z1: number, topFill: string, sideFill: string, edge: string): void {
    const corners = [
        localRot(lx0, ly0, fp),
        localRot(lx1, ly0, fp),
        localRot(lx1, ly1, fp),
        localRot(lx0, ly1, fp)
    ];
    const bot: Point2D[] = [];
    const top: Point2D[] = [];
    for (let i = 0; i < 4; i++) {
        bot.push(project(corners[i].x, corners[i].y, z0));
        top.push(project(corners[i].x, corners[i].y, z1));
    }
    ctx.fillStyle = sideFill;
    for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4;
        ctx.beginPath();
        ctx.moveTo(bot[k].x, bot[k].y);
        ctx.lineTo(bot[n].x, bot[n].y);
        ctx.lineTo(top[n].x, top[n].y);
        ctx.lineTo(top[k].x, top[k].y);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = topFill;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (let k = 1; k < 4; k++)
        ctx.lineTo(top[k].x, top[k].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}
export class Pcb3dRenderer {
    private static meshCacheKey: string = '';
    private static meshCache: import('./Pcb3dMath').Mesh3d | null = null;
    private static lastDrawTraceMs: number = 0;
    /** 绘制路径决策写入 instr_trace（节流） */
    private static traceDrawDecisions(doc: PcbDocument, p: Pcb3dViewParams, boardH: number, boardTopAlpha: number, path: string): void {
        const now = Date.now();
        if (now - Pcb3dRenderer.lastDrawTraceMs < 2800)
            return;
        Pcb3dRenderer.lastDrawTraceMs = now;
        const copperOrder = copperOrderOf(doc);
        tracePcb3d('DRAW_PATH', `path=${path} appearanceMode=${p.appearanceMode} active=${p.activeLayer} ` +
            `hideZones=${p.hideZones} boardH=${boardH.toFixed(1)} topMaskA=${boardTopAlpha.toFixed(2)} ` +
            `zoom=${p.zoom.toFixed(3)} lodFar=${p.zoom < 0.45}`);
        let drawnBotZone = 0;
        let skipBotZone = 0;
        let drawnTopZone = 0;
        let drawnBotTrk = 0;
        let drawnTopTrk = 0;
        let skipTrk = 0;
        for (let zi = 0; zi < doc.zones.length; zi++) {
            const zn = doc.zones[zi];
            if (!isCopperLayer(zn.layer) || zn.outline.length < 3) {
                skipBotZone++;
                continue;
            }
            const ok = copperDrawOk(doc, zn.layer, p);
            const bot = isBottomSideCopper(zn.layer, copperOrder, doc.layerStack);
            const col = layerColor(doc, zn.layer);
            if (!ok || p.hideZones) {
                skipBotZone++;
                tracePcb3d('DRAW_SKIP_ZONE', `layer=${zn.layer} net=${zn.netName || '-'} ok=${ok} hideZones=${p.hideZones} ` +
                    `color=${col} side=${bot ? 'B' : 'F'}`);
                continue;
            }
            if (bot)
                drawnBotZone++;
            else
                drawnTopZone++;
            const z = copperWorldZ(zn.layer, boardH, copperOrder, false, 0, doc.layerStack);
            const a = bot ? 0.82 : 0.38;
            tracePcb3d('DRAW_ZONE', `layer=${zn.layer} net=${zn.netName || zn.netId || '-'} color=${col} alpha≈${a.toFixed(2)} ` +
                `z=${z.toFixed(1)} cutouts=${zn.cutouts !== undefined ? zn.cutouts.length : 0} side=${bot ? 'B' : 'F'}`);
        }
        for (let ti = 0; ti < doc.tracks.length; ti++) {
            const trk = doc.tracks[ti];
            if (!isCopperLayer(trk.layer))
                continue;
            if (!copperDrawOk(doc, trk.layer, p)) {
                skipTrk++;
                continue;
            }
            const bot = isBottomSideCopper(trk.layer, copperOrder, doc.layerStack);
            if (bot)
                drawnBotTrk++;
            else
                drawnTopTrk++;
        }
        // 每种铜层实际着色
        for (let li = 0; li < copperOrder.length; li++) {
            const ly = copperOrder[li];
            const col = layerColor(doc, ly);
            const ok = copperDrawOk(doc, ly, p);
            tracePcb3d('DRAW_LAYER_COLOR', `${ly} color=${col} drawOk=${ok} bottom=${isBottomSideCopper(ly, copperOrder, doc.layerStack)} ` +
                `zNorm=${copperLayerNormZ(ly, copperOrder, doc.layerStack).toFixed(3)}`);
        }
        tracePcb3d('DRAW_SUMMARY', `zones F=${drawnTopZone} B=${drawnBotZone} skipZone≈${skipBotZone} ` +
            `trk F=${drawnTopTrk} B=${drawnBotTrk} skipTrk=${skipTrk} vias=${doc.vias.length}`);
        if (drawnBotZone === 0 && drawnBotTrk === 0) {
            tracePcb3d('DRAW_DIAG', `底层无任何铜被绘制 — 查 ACTIVE_ONLY/hideZones/文档是否缺 B.Cu zone&track`);
        }
    }
    private static docMeshSig(doc: PcbDocument): string {
        let s = `v3d4|${doc.id}|cu${doc.layerStack !== undefined ? doc.layerStack.copperCount : 2}|t${doc.tracks.length}|v${doc.vias.length}|f${doc.footprints.length}|z${doc.zones.length}|o${doc.boardOutline.points.length}|sb${getBoundStepSig()}`;
        for (let i = 0; i < doc.footprints.length; i++) {
            const fp = doc.footprints[i];
            s += `|${fp.defId}@${fp.position.x.toFixed(1)},${fp.position.y.toFixed(1)},${fp.rotation as number},${fp.mirrored === true ? 1 : 0}`;
        }
        if (doc.tracks.length > 0) {
            const t = doc.tracks[doc.tracks.length - 1];
            s += `|Lt${t.start.x.toFixed(0)},${t.end.x.toFixed(0)},${t.width.toFixed(0)},${t.layer}`;
        }
        if (doc.vias.length > 0) {
            const v = doc.vias[doc.vias.length - 1];
            s += `|Vv${v.position.x.toFixed(0)},${v.position.y.toFixed(0)},${v.diameter.toFixed(0)}`;
        }
        return s;
    }
    private static getCachedMesh(doc: PcbDocument): import('./Pcb3dMath').Mesh3d {
        const key = Pcb3dRenderer.docMeshSig(doc);
        if (Pcb3dRenderer.meshCache !== null && Pcb3dRenderer.meshCacheKey === key) {
            return Pcb3dRenderer.meshCache;
        }
        const mesh = Pcb3dMeshBuilder.build(doc, 60000);
        Pcb3dRenderer.meshCacheKey = key;
        Pcb3dRenderer.meshCache = mesh;
        return mesh;
    }
    static invalidateMeshCache(): void {
        Pcb3dRenderer.meshCacheKey = '';
        Pcb3dRenderer.meshCache = null;
    }
    static render(ctx: CanvasRenderingContext2D, doc: PcbDocument, p: Pcb3dViewParams): void {
        const mode = p.displayMode !== undefined ? p.displayMode : Pcb3dDisplayMode.REALISTIC;
        if (p.usePbr && mode === Pcb3dDisplayMode.REALISTIC) {
            Pcb3dRenderer.traceDrawDecisions(doc, p, boardThicknessWorld(doc), 0.28, 'pbr');
            Pcb3dRenderer.renderPbr(ctx, doc, p);
            return;
        }
        // 背景：深色渐变模拟工作室环境
        const grad = ctx.createLinearGradient(0, 0, 0, p.viewHeight);
        grad.addColorStop(0, '#1E2430');
        grad.addColorStop(0.4, '#252D3A');
        grad.addColorStop(0.7, '#2A3444');
        grad.addColorStop(1, '#1A2030');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, p.viewWidth, p.viewHeight);
        let yawDeg = p.yawDeg;
        let pitchDeg = p.pitchDeg;
        if (!(yawDeg >= -10000 && yawDeg <= 10000))
            yawDeg = 35;
        // 俯仰范围：顶视可到 88；过低会穿板
        if (pitchDeg < 12)
            pitchDeg = 12;
        if (pitchDeg > 88)
            pitchDeg = 88;
        const yaw = yawDeg * Math.PI / 180;
        const pitch = pitchDeg * Math.PI / 180;
        const cyaw = Math.cos(yaw);
        const syaw = Math.sin(yaw);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        // 椭圆压扁比 = cos(pitch)：正交投影下圆→椭圆的精确压缩率
        // 留最小 0.28 避免极低俯仰时椭圆过于扁平看不清
        const flatY = Math.max(0.28, Math.abs(cp));
        const outline = doc.boardOutline.points;
        let boardCx = 0;
        let boardCy = 0;
        if (outline.length > 0) {
            for (let i = 0; i < outline.length; i++) {
                boardCx += outline[i].x;
                boardCy += outline[i].y;
            }
            boardCx /= outline.length;
            boardCy /= outline.length;
        }
        const copper = copperLayersFromStack(doc.layerStack);
        const layerCount = Math.max(copper.length, 2);
        const zoom = Math.max(p.zoom, 0.05);
        const lodFar = zoom < 0.45;
        const lodNear = zoom >= 0.9;
        // 板厚由铜层数 / layerStack 物理厚度决定（不再跟 zoom 挂钩）
        const boardH = boardThicknessWorld(doc);
        const boardMm = boardH * (1.6 / 56);
        const ox = p.viewWidth / 2 + p.panX;
        const oy = p.viewHeight / 2 + p.panY;
        // 默认正交，避免透视缩放导致旋转后边线不平行、板体“扭曲”
        const ortho = p.ortho !== false;
        const perspK = ortho ? 0 : 0.00008;
        const project: ProjectFn = (wx: number, wy: number, wz: number): Point2D => {
            const x0 = wx - boardCx;
            const y0 = wy - boardCy;
            const x1 = x0 * cyaw - y0 * syaw;
            const y1 = x0 * syaw + y0 * cyaw;
            const y2 = y1 * cp - wz * sp;
            let sx = x1 * zoom;
            let sy = y2 * zoom;
            if (!ortho) {
                // 弱透视：以板心深度为基准，减小边缘拉伸
                const depth = y1 * sp + wz * cp;
                const scale = 1 / (1 + depth * perspK);
                sx *= scale;
                sy *= scale;
            }
            return { x: ox + sx, y: oy + sy };
        };
        const depthOf = (wx: number, wy: number, wz: number): number => {
            const x0 = wx - boardCx;
            const y0 = wy - boardCy;
            const y1 = x0 * syaw + y0 * cyaw;
            return y1 * sp + wz * cp;
        };
        const hl = p.highlightNetId;
        const hasHl = hl.length > 0;
        const dim = Math.max(0.12, Math.min(0.45, p.dimAlpha > 0 ? p.dimAlpha : 0.28));
        const selFp = new Set(p.selectedFpIds);
        const selTrk = new Set(p.selectedTrackIds);
        const selVia = new Set(p.selectedViaIds);
        const showSilk = isLayerVis(doc, PcbLayerId.F_SILKS) && layerOpacity(doc, PcbLayerId.F_SILKS) > 0.05;
        const silkAlpha = layerOpacity(doc, PcbLayerId.F_SILKS);
        const silkFocus = p.activeLayer === PcbLayerId.F_SILKS || p.activeLayer === PcbLayerId.B_SILKS;
        // 各层可见性
        const showBackSilk = isLayerVis(doc, PcbLayerId.B_SILKS) && layerOpacity(doc, PcbLayerId.B_SILKS) > 0.05;
        const backSilkAlpha = layerOpacity(doc, PcbLayerId.B_SILKS);
        const showFrontMask = isLayerVis(doc, PcbLayerId.F_MASK) && layerOpacity(doc, PcbLayerId.F_MASK) > 0.05;
        const frontMaskAlpha = showFrontMask ? layerOpacity(doc, PcbLayerId.F_MASK) : 1;
        const showBackMask = isLayerVis(doc, PcbLayerId.B_MASK) && layerOpacity(doc, PcbLayerId.B_MASK) > 0.05;
        const backMaskAlpha = layerOpacity(doc, PcbLayerId.B_MASK);
        const showFrontPaste = isLayerVis(doc, PcbLayerId.F_PASTE) && layerOpacity(doc, PcbLayerId.F_PASTE) > 0.05;
        const frontPasteAlpha = layerOpacity(doc, PcbLayerId.F_PASTE);
        const showBackPaste = isLayerVis(doc, PcbLayerId.B_PASTE) && layerOpacity(doc, PcbLayerId.B_PASTE) > 0.05;
        const backPasteAlpha = layerOpacity(doc, PcbLayerId.B_PASTE);
        const showEdgeCuts = isLayerVis(doc, PcbLayerId.EDGE_CUTS) && layerOpacity(doc, PcbLayerId.EDGE_CUTS) > 0.05;
        const edgeCutsAlpha = layerOpacity(doc, PcbLayerId.EDGE_CUTS);
        const showCourtyard = isLayerVis(doc, PcbLayerId.COURTYARD) && layerOpacity(doc, PcbLayerId.COURTYARD) > 0.05;
        const courtyardAlpha = layerOpacity(doc, PcbLayerId.COURTYARD);
        const xray = mode === Pcb3dDisplayMode.XRAY;
        const explode = mode === Pcb3dDisplayMode.EXPLODE;
        const cutaway = mode === Pcb3dDisplayMode.CUTAWAY;
        const heightmap = mode === Pcb3dDisplayMode.HEIGHTMAP;
        const copperOrder = copperOrderOf(doc);
        const explodeGap = Math.max(28, boardH * 0.55);
        // 写实扁铜：挤出高度压到贴面；爆炸/半透明仍略厚便于辨层
        const cuH = (xray || explode) ? (lodFar ? 1.2 : (lodNear ? 4.2 : 2.8)) : (lodFar ? 0.6 : 1.2);
        let cutX: number | null = null;
        if (cutaway) {
            const bx = boardBoundsX(doc);
            const frac = Math.max(0.05, Math.min(0.95, p.cutFraction > 0 ? p.cutFraction : 0.55));
            cutX = bx.x + (bx.y - bx.x) * frac;
        }
        const activeIsBottom = isCopperLayer(p.activeLayer) && isBottomSideCopper(p.activeLayer, copperOrder, doc.layerStack);
        const focusBottom = activeIsBottom && p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY;
        const boostBottom = activeIsBottom &&
            (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY ||
                p.appearanceMode === PcbAppearanceMode.DIM_INACTIVE);
        // 方案 A：实心绿阻焊 + 棕色侧边；看底层时略透以便见 B.Cu
        const maskAlpha = xray ? 0.18 : (explode ? 0.35 : 0.55);
        const edgeAlpha = xray || boostBottom ? 0.7 : 1.0;
        const boardGhost = explode ? 0.35 : (xray ? 0.4 : 1.0);
        const boardTopAlpha = focusBottom ? 0.12 : (boostBottom ? 0.45 : (xray ? 0.22 : 0.94));
        Pcb3dRenderer.traceDrawDecisions(doc, p, boardH, boardTopAlpha, 'canvas');
        Pcb3dRenderer.drawFloor(ctx, project, boardCx, boardCy, doc);
        // 阴影偏移：跟随光源方向（左上主光 → 阴影偏右下）
        // 屏幕空间方向随 yaw 旋转，保证阴影始终投射在一致的世界方向
        const shadowLen = 52;
        const shadowDirX = Math.cos(yaw + 0.95); // ~54° 偏角，匹配主光
        const shadowDirY = Math.sin(yaw + 0.95) * cp;
        if (outline.length >= 3) {
            const sxOff0 = shadowDirX * shadowLen;
            const syOff0 = shadowDirY * shadowLen;
            const sxOff1 = sxOff0 * 0.52;
            const syOff1 = syOff0 * 0.52;
            // 外层柔影
            ctx.fillStyle = 'rgba(0,0,0,0.30)';
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x + sxOff0, outline[i].y + syOff0, -2);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
            // 内层锐影
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x + sxOff1, outline[i].y + syOff1, -1);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
            // 板底面：深棕
            ctx.fillStyle = hexAlpha('#211A14', boardGhost);
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x, outline[i].y, 0);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
            // 板侧立面（0→boardH）：每面独立光照
            for (let i = 0; i < outline.length; i++) {
                const a = outline[i];
                const b = outline[(i + 1) % outline.length];
                const mx = (a.x + b.x) / 2;
                if (cutaway && cutX !== null && isCutAway(mx, cutX))
                    continue;
                const my = (a.y + b.y) / 2;
                // 基于面法线方向计算光照
                const edgeNx = -(b.y - a.y);
                const edgeNy = b.x - a.x;
                const edgeLen = Math.sqrt(edgeNx * edgeNx + edgeNy * edgeNy) || 1;
                const enx = edgeNx / edgeLen;
                const eny = edgeNy / edgeLen;
                const facing = enx * cyaw + eny * syaw;
                const lit = facing > 0.15;
                const veryLit = facing > 0.55;
                const edgeCol = veryLit ? Mat3d.FR4_EDGE_LIT : (lit ? Mat3d.FR4_EDGE : Mat3d.FR4_EDGE_DIM);
                ctx.fillStyle = hexAlpha(edgeCol, edgeAlpha * boardGhost);
                const a0 = project(a.x, a.y, 0);
                const b0 = project(b.x, b.y, 0);
                const a1 = project(a.x, a.y, boardH);
                const b1 = project(b.x, b.y, boardH);
                ctx.beginPath();
                ctx.moveTo(a0.x, a0.y);
                ctx.lineTo(b0.x, b0.y);
                ctx.lineTo(b1.x, b1.y);
                ctx.lineTo(a1.x, a1.y);
                ctx.closePath();
                ctx.fill();
            }
            if (focusBottom) {
                ctx.strokeStyle = hexAlpha('#69F0AE', 0.65);
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                for (let i = 0; i < outline.length; i++) {
                    const pt = project(outline[i].x, outline[i].y, boardH * 0.08);
                    if (i === 0)
                        ctx.moveTo(pt.x, pt.y);
                    else
                        ctx.lineTo(pt.x, pt.y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
        if (cutaway && cutX !== null) {
            const by = boardBoundsY(doc);
            const y0 = by.x;
            const y1 = by.y;
            const bandH = boardH / Math.max(copperOrder.length, 1);
            for (let bi = 0; bi < copperOrder.length; bi++) {
                const z0 = bi * bandH;
                const z1 = (bi + 1) * bandH;
                const c00 = project(cutX, y0, z0);
                const c01 = project(cutX, y1, z0);
                const c11 = project(cutX, y1, z1);
                const c10 = project(cutX, y0, z1);
                ctx.fillStyle = bi % 2 === 0 ? '#E8C830' : hexAlpha(layerColor(doc, copperOrder[bi]), 0.85);
                ctx.beginPath();
                ctx.moveTo(c00.x, c00.y);
                ctx.lineTo(c01.x, c01.y);
                ctx.lineTo(c11.x, c11.y);
                ctx.lineTo(c10.x, c10.y);
                ctx.closePath();
                ctx.fill();
            }
            const midY = (y0 + y1) / 2;
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            const topE = project(cutX, midY, boardH);
            const botE = project(cutX, midY, 0);
            ctx.beginPath();
            ctx.moveTo(topE.x, topE.y);
            ctx.lineTo(botE.x, botE.y);
            ctx.stroke();
        }
        // ═══════════════════════════════════════════════
        // 层序 (painter 后画在上)：
        //  底板 → 背面 Paste → 背面 Mask → 背面 Silk → B.Cu →
        //  板体 → 顶面 Mask → F.Cu → 过孔 → 顶面 Paste →
        //  元件 → Edge Cuts → Courtyard → HUD
        // ═══════════════════════════════════════════════
        // ── 背面钢网 (Back Paste) ──
        if (showBackPaste && outline.length >= 3 && !lodFar) {
            Pcb3dRenderer.drawPastePass(ctx, project, doc, boardH, copperOrder, backPasteAlpha, true);
        }
        // ── 背面阻焊 (Back Mask) ──
        if (showBackMask && outline.length >= 3) {
            Pcb3dRenderer.drawMaskLayer(ctx, project, outline, 0.6, boardH, backMaskAlpha * boardGhost, false);
        }
        // ── 背面丝印 (Back Silk) ──
        if (showBackSilk && outline.length >= 3 && !lodFar) {
            Pcb3dRenderer.drawSilkLayer(ctx, project, doc, outline, boardH, backSilkAlpha, true);
        }
        // ── B.Cu 底层铜 (bottomOnly=true) ──
        Pcb3dRenderer.drawCopperPass(ctx, project, depthOf, doc, p, boardH, copperOrder, explode, explodeGap, cutaway, cutX, hasHl, hl, dim, cuH, zoom, lodFar, true);
        // ── 板体顶面：阻焊 + 微光泽 + 丝印板框 ──
        if (outline.length >= 3 && !focusBottom) {
            // 顶面阻焊 — 分层渲染：底色 + 渐变 + 微纹理
            if (showFrontMask) {
                Pcb3dRenderer.drawMaskLayer(ctx, project, outline, boardH - 0.2, boardH, Math.min(0.72, frontMaskAlpha * boardTopAlpha), true);
            }
            else {
                // 图层面板关掉 F.Mask 时仍画默认绿色顶面
                ctx.fillStyle = hexAlpha(Mat3d.MASK_TOP, boardTopAlpha);
                ctx.beginPath();
                for (let i = 0; i < outline.length; i++) {
                    const pt = project(outline[i].x, outline[i].y, boardH);
                    if (i === 0)
                        ctx.moveTo(pt.x, pt.y);
                    else
                        ctx.lineTo(pt.x, pt.y);
                }
                ctx.closePath();
                ctx.fill();
            }
            // 板边高光线
            ctx.strokeStyle = hexAlpha(Mat3d.MASK_TOP_LIT, Math.min(0.85, boardTopAlpha + 0.15));
            ctx.lineWidth = 2;
            ctx.stroke();
            // 板面微光泽
            const lightFac = 0.08 - (syaw * 0.02 + cyaw * 0.02);
            ctx.fillStyle = hexAlpha('#FFFFFF', Math.max(0, Math.min(0.12, lightFac * boardTopAlpha)));
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x, outline[i].y, boardH + 0.3);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
            // 顶面丝印板框
            if (showSilk && !lodFar) {
                Pcb3dRenderer.drawSilkLayer(ctx, project, doc, outline, boardH, silkAlpha, false);
            }
        }
        // ── F.Cu 顶层铜 (bottomOnly=false) ──
        if (!focusBottom) {
            Pcb3dRenderer.drawCopperPass(ctx, project, depthOf, doc, p, boardH, copperOrder, explode, explodeGap, cutaway, cutX, hasHl, hl, dim, cuH, zoom, lodFar, false);
        }
        const viaDraws: ViaDraw[] = [];
        for (let vi = 0; vi < doc.vias.length; vi++) {
            const via = doc.vias[vi];
            if (cutaway && cutX !== null && isCutAway(via.position.x, cutX))
                continue;
            if (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY && isCopperLayer(p.activeLayer)) {
                const spans = via.layers.length === 0 ||
                    via.layers.indexOf(p.activeLayer) >= 0 ||
                    (via.layers.indexOf(PcbLayerId.F_CU) >= 0 && via.layers.indexOf(PcbLayerId.B_CU) >= 0);
                if (!spans)
                    continue;
            }
            const span = viaZSpan(via.layers, via.kind, boardH, copperOrder, explode, explodeGap, doc.layerStack);
            const kind = via.kind !== undefined ? via.kind : PcbViaKind.THROUGH;
            viaDraws.push({
                x: via.position.x, y: via.position.y,
                outerR: via.diameter / 2,
                drillR: via.drill > 0 ? via.drill / 2 : via.diameter * 0.22,
                plated: true,
                depth: depthOf(via.position.x, via.position.y, (span.x + span.y) / 2),
                netId: via.netId, id: via.id,
                zBot: span.x, zTop: span.y, kind
            });
        }
        viaDraws.sort((a: ViaDraw, b: ViaDraw) => a.depth - b.depth);
        if (!focusBottom) {
            for (let i = 0; i < viaDraws.length; i++) {
                const v = viaDraws[i];
                const faded = hasHl && v.netId !== hl;
                const alpha = faded ? dim : 1;
                Pcb3dRenderer.drawViaBarrel(ctx, project, v.x, v.y, v.zBot, v.zTop, v.outerR, v.drillR, zoom, flatY, v.plated, lodNear, alpha, selVia.has(v.id), v.kind);
            }
        }
        if (explode) {
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            for (let li = 0; li < copperOrder.length; li++) {
                const layer = copperOrder[li];
                if (!isLayerVis(doc, layer))
                    continue;
                const z = copperWorldZ(layer, boardH, copperOrder, true, explodeGap, doc.layerStack);
                const lp = project(boardCx - 180, boardCy - 220 + li * 36, z);
                ctx.fillStyle = 'rgba(18,22,30,0.75)';
                ctx.fillRect(lp.x - 4, lp.y - 10, 120, 20);
                ctx.fillStyle = layerColor(doc, layer);
                ctx.fillRect(lp.x - 2, lp.y - 6, 10, 12);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(layerDisplayName(doc, layer), lp.x + 12, lp.y);
            }
        }
        // 顶面钢网须在元件之前（painter），且用板面投影四边形，禁止屏幕 fillRect 白方块
        if (showFrontPaste && outline.length >= 3 && !lodFar && !focusBottom) {
            Pcb3dRenderer.drawPastePass(ctx, project, doc, boardH, copperOrder, frontPasteAlpha, false);
        }
        const lib = getGlobalPcbFootprintLibrary();
        const fpDraws: FpDraw[] = [];
        for (let fi = 0; fi < doc.footprints.length; fi++) {
            const fp = doc.footprints[fi];
            if (cutaway && cutX !== null && isCutAway(fp.position.x, cutX))
                continue;
            const def = lib.getDef(fp.defId);
            const libId = fp.schematicCompId !== undefined ? fp.schematicCompId : '';
            const kind = fpKind(fp.defId, fp.refDes, fp.value, libId);
            const bodyH = bodyHeight(kind, zoom, lodFar);
            const zBase = fp.layer === PcbLayerId.B_CU ? 1 : boardH;
            let hw = 28;
            let hh = 18;
            if (kind === 'smd' || kind === 'res' || kind === 'cap' || kind === 'ind' || kind === 'fuse') {
                hw = 26;
                hh = 14;
            }
            else if (kind === 'elec') {
                hw = 24;
                hh = 24;
            }
            else if (kind === 'to220') {
                hw = 54;
                hh = 38;
            }
            else if (kind === 'header') {
                hw = 22;
                hh = Math.max(38, fp.pads.length * 44 / 2);
            }
            else if (kind === 'ic' || kind === 'sot') {
                hw = 50;
                hh = 38;
            }
            else if (kind === 'pot') {
                hw = 22;
                hh = 22;
            }
            else if (kind === 'xtal') {
                hw = 30;
                hh = 18;
            }
            else if (kind === 'led') {
                hw = 16;
                hh = 16;
            }
            else if (kind === 'diode' || kind === 'bjt' || kind === 'mosfet') {
                hw = 24;
                hh = 16;
            }
            else if (kind === 'switch') {
                hw = 24;
                hh = 24;
            }
            else if (kind === 'relay') {
                hw = 42;
                hh = 30;
            }
            else if (kind === 'buzzer') {
                hw = 30;
                hh = 30;
            }
            else if (kind === 'lcd') {
                hw = 80;
                hh = 36;
            }
            else if (kind === 'oled') {
                hw = 38;
                hh = 24;
            }
            else if (kind === 'sensor_to92' || kind === 'sensor_sip') {
                hw = 20;
                hh = 18;
            }
            else if (kind === 'ldr') {
                hw = 18;
                hh = 18;
            }
            else if (kind === 'instrument') {
                hw = 28;
                hh = 20;
            }
            else if (kind === 'terminal') {
                hw = 18;
                hh = 12;
            }
            else if (kind === 'mount') {
                hw = 22;
                hh = 22;
            }
            // 对 IC 类型根据焊盘数量调整大小
            if (def && (kind === 'ic' || kind === 'sot' || kind === 'tht')) {
                for (let pi = 0; pi < def.pads.length; pi++) {
                    const pad = def.pads[pi];
                    hw = Math.max(hw, Math.abs(pad.pos.x) + pad.size.x / 2);
                    hh = Math.max(hh, Math.abs(pad.pos.y) + pad.size.y / 2);
                }
                hw *= 0.84;
                hh *= 0.84;
            }
            fpDraws.push({
                fp, kind, hw, hh, zBase, bodyH, libId,
                selected: selFp.has(fp.id),
                depth: depthOf(fp.position.x, fp.position.y, zBase + bodyH / 2)
            });
        }
        fpDraws.sort((a: FpDraw, b: FpDraw) => a.depth - b.depth);
        const fpGhost = focusBottom;
        // 元件阴影：板面投影菱形（随封装旋转），避免屏幕方影
        const compSx = shadowDirX * 12;
        const compSy = shadowDirY * 12;
        for (let i = 0; i < fpDraws.length; i++) {
            const it = fpDraws[i];
            if (it.kind === 'mount' || it.bodyH < 1)
                continue;
            const hx = Math.max(6, it.hw * 0.72);
            const hy = Math.max(4, it.hh * 0.72);
            const aOuter = fpGhost ? 0.04 : 0.10;
            const aInner = fpGhost ? 0.06 : 0.16;
            const shZ = boardH + 0.25;
            // 影子中心偏移，轮廓按封装朝向
            const scX = it.fp.position.x + compSx;
            const scY = it.fp.position.y + compSy;
            const pL = localRot(-hx, 0, it.fp);
            const pT = localRot(0, -hy, it.fp);
            const pR = localRot(hx, 0, it.fp);
            const pB = localRot(0, hy, it.fp);
            const c0 = project(scX + (pL.x - it.fp.position.x), scY + (pL.y - it.fp.position.y), shZ);
            const c1 = project(scX + (pT.x - it.fp.position.x), scY + (pT.y - it.fp.position.y), shZ);
            const c2 = project(scX + (pR.x - it.fp.position.x), scY + (pR.y - it.fp.position.y), shZ);
            const c3 = project(scX + (pB.x - it.fp.position.x), scY + (pB.y - it.fp.position.y), shZ);
            ctx.fillStyle = 'rgba(0,0,0,' + aOuter.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(c0.x, c0.y);
            ctx.lineTo(c1.x, c1.y);
            ctx.lineTo(c2.x, c2.y);
            ctx.lineTo(c3.x, c3.y);
            ctx.closePath();
            ctx.fill();
            const qL = localRot(-hx * 0.62, 0, it.fp);
            const qT = localRot(0, -hy * 0.62, it.fp);
            const qR = localRot(hx * 0.62, 0, it.fp);
            const qB = localRot(0, hy * 0.62, it.fp);
            const d0 = project(scX + (qL.x - it.fp.position.x), scY + (qL.y - it.fp.position.y), shZ + 0.05);
            const d1 = project(scX + (qT.x - it.fp.position.x), scY + (qT.y - it.fp.position.y), shZ + 0.05);
            const d2 = project(scX + (qR.x - it.fp.position.x), scY + (qR.y - it.fp.position.y), shZ + 0.05);
            const d3 = project(scX + (qB.x - it.fp.position.x), scY + (qB.y - it.fp.position.y), shZ + 0.05);
            ctx.fillStyle = 'rgba(0,0,0,' + aInner.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(d0.x, d0.y);
            ctx.lineTo(d1.x, d1.y);
            ctx.lineTo(d2.x, d2.y);
            ctx.lineTo(d3.x, d3.y);
            ctx.closePath();
            ctx.fill();
        }
        for (let i = 0; i < fpDraws.length; i++) {
            const it = fpDraws[i];
            if (fpGhost) {
                ctx.globalAlpha = 0.28;
            }
            Pcb3dRenderer.drawPads(ctx, project, it, zoom, flatY, boardH, cuH, lodNear, true);
            Pcb3dRenderer.drawComponent(ctx, project, it, zoom, lodFar, flatY, heightmap, boardH);
            if (fpGhost) {
                ctx.globalAlpha = 1;
            }
            if (it.selected) {
                Pcb3dRenderer.drawSelectionHalo(ctx, project, it);
            }
            if (showSilk && !lodFar && !fpGhost) {
                const fontPx = Math.max(silkFocus ? 11 : 8, Math.min(silkFocus ? 16 : 12, 7 + zoom * 3.2));
                // refDes 标签
                const lp = project(it.fp.position.x, it.fp.position.y - it.hh - 14, boardH + it.bodyH + 2);
                const prevA = ctx.globalAlpha;
                ctx.globalAlpha = Math.min(1, silkAlpha * (silkFocus ? 1.0 : 0.88));
                Pcb3dRenderer.drawSilkLabel(ctx, it.fp.refDes, lp.x, lp.y, fontPx);
                // value 标签（小字，偏移）
                if (it.fp.value.length > 0 && it.fp.value !== it.fp.refDes) {
                    const vp = project(it.fp.position.x, it.fp.position.y - it.hh - 14, boardH + it.bodyH + 2);
                    ctx.globalAlpha = Math.min(1, silkAlpha * 0.72);
                    Pcb3dRenderer.drawSilkLabel(ctx, it.fp.value, vp.x, vp.y + fontPx + 2, fontPx * 0.72);
                }
                ctx.globalAlpha = prevA;
            }
        }
        if (focusBottom) {
            Pcb3dRenderer.drawCopperPass(ctx, project, depthOf, doc, p, boardH, copperOrder, explode, explodeGap, cutaway, cutX, hasHl, hl, dim, cuH, zoom, lodFar, true);
            for (let i = 0; i < viaDraws.length; i++) {
                const v = viaDraws[i];
                const faded = hasHl && v.netId !== hl;
                const alpha = faded ? dim : 1;
                Pcb3dRenderer.drawViaBarrel(ctx, project, v.x, v.y, v.zBot, v.zTop, v.outerR, v.drillR, zoom, flatY, v.plated, lodNear, alpha, selVia.has(v.id), v.kind);
            }
        }
        if (p.showInterference) {
            const issues = detectInterference(doc, 8);
            ctx.strokeStyle = '#FF1744';
            ctx.lineWidth = 2;
            for (let ii = 0; ii < issues.length; ii++) {
                const iss = issues[ii];
                let ax = 0;
                let ay = 0;
                let bx = 0;
                let by = 0;
                let foundA = false;
                let foundB = false;
                for (let fi = 0; fi < doc.footprints.length; fi++) {
                    const fp = doc.footprints[fi];
                    if (fp.id === iss.aId) {
                        ax = fp.position.x;
                        ay = fp.position.y;
                        foundA = true;
                    }
                    if (fp.id === iss.bId) {
                        bx = fp.position.x;
                        by = fp.position.y;
                        foundB = true;
                    }
                }
                if (!foundA || !foundB)
                    continue;
                const pa = project(ax, ay, boardH + 18);
                const pb = project(bx, by, boardH + 18);
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2 - 8;
                ctx.fillStyle = 'rgba(255,23,68,0.92)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${iss.aRef}↔${iss.bRef} ${iss.overlapMil.toFixed(0)}mil`, mx, my);
            }
        }
        if (p.measurePts.length > 0) {
            ctx.fillStyle = '#00E676';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            for (let mi = 0; mi < p.measurePts.length; mi++) {
                const mp = p.measurePts[mi];
                const sp = project(mp.x, mp.y, boardH + 6);
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            if (p.measurePts.length >= 2) {
                const a = p.measurePts[0];
                const b = p.measurePts[1];
                const pa = project(a.x, a.y, boardH + 6);
                const pb = project(b.x, b.y, boardH + 6);
                ctx.strokeStyle = '#00E676';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
                const dMil = dist3(a, b);
                const dMm = milToMm(dMil);
                const label = project((a.x + b.x) / 2, (a.y + b.y) / 2, boardH + 14);
                ctx.fillStyle = 'rgba(0,0,0,0.72)';
                ctx.fillRect(label.x - 42, label.y - 10, 84, 20);
                ctx.fillStyle = '#00E676';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${dMil.toFixed(1)} mil / ${dMm.toFixed(2)} mm`, label.x, label.y);
            }
        }
        // ── Edge Cuts 板框线 ──
        if (showEdgeCuts && outline.length >= 3) {
            Pcb3dRenderer.drawEdgeCutsLayer(ctx, project, outline, boardH, edgeCutsAlpha);
        }
        // ── Courtyard 元件边界 ──
        if (showCourtyard && outline.length >= 3 && !lodFar) {
            Pcb3dRenderer.drawCourtyardLayer(ctx, project, doc, boardH, courtyardAlpha);
        }
        // 暗角（vignette）：径向渐变叠加，增强画面深度
        const vg = ctx.createRadialGradient(p.viewWidth / 2, p.viewHeight / 2, p.viewWidth * 0.42, p.viewWidth / 2, p.viewHeight / 2, p.viewWidth * 0.92);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.55, 'rgba(0,0,0,0.02)');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, p.viewWidth, p.viewHeight);
        const modeTag = ortho ? '正交' : '透视';
        const modeName = displayModeLabel(mode);
        let focusTag = '全层可见';
        if (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY && isCopperLayer(p.activeLayer)) {
            focusTag = `单层 ${p.activeLayer}`;
        }
        else if (p.appearanceMode === PcbAppearanceMode.DIM_INACTIVE && isCopperLayer(p.activeLayer)) {
            focusTag = `突出 ${p.activeLayer}`;
        }
        else if (silkFocus) {
            focusTag = `丝印加亮 · 铜仍可见`;
        }
        else if (!isCopperLayer(p.activeLayer)) {
            focusTag = `活动 ${p.activeLayer}`;
        }
        ctx.fillStyle = 'rgba(14,18,26,0.82)';
        ctx.fillRect(8, 8, 540, 64);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`3D · ${modeName} · ${modeTag} · ${layerCount}铜层 · 板厚≈${boardMm.toFixed(2)}mm · ${focusTag}`, 16, 24);
        ctx.fillStyle = 'rgba(180,210,255,0.92)';
        ctx.font = '11px sans-serif';
        ctx.fillText(`yaw ${yawDeg.toFixed(0)}°  pitch ${pitchDeg.toFixed(0)}°  · 左键旋转 · 滚轮缩放 · 右键平移`, 16, 44);
        // 铜层分色图例
        let lx = 16;
        const ly = 58;
        for (let li = 0; li < copperOrder.length; li++) {
            const layer = copperOrder[li];
            if (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY && layer !== p.activeLayer)
                continue;
            const col = layerColor(doc, layer);
            ctx.fillStyle = col;
            ctx.fillRect(lx, ly - 8, 10, 10);
            ctx.fillStyle = layer === p.activeLayer ? '#FFFFFF' : 'rgba(220,230,245,0.9)';
            ctx.font = layer === p.activeLayer ? 'bold 10px sans-serif' : '10px sans-serif';
            const label = `${layer}`;
            ctx.fillText(label, lx + 13, ly);
            lx += 13 + label.length * 6.2 + 12;
        }
    }
    /** 轻量 Z-buffer 写实路径（主线程安全） */
    private static renderPbr(ctx: CanvasRenderingContext2D, doc: PcbDocument, p: Pcb3dViewParams): void {
        const outline = doc.boardOutline.points;
        let boardCx = 0;
        let boardCy = 0;
        if (outline.length > 0) {
            for (let i = 0; i < outline.length; i++) {
                boardCx += outline[i].x;
                boardCy += outline[i].y;
            }
            boardCx /= outline.length;
            boardCy /= outline.length;
        }
        const mesh = Pcb3dRenderer.getCachedMesh(doc);
        // PBR 光栅：内部按 55% 缩放，这里传全分辨率即可
        const srcW = Math.min(500, Math.max(120, Math.floor(p.viewWidth * 0.55)));
        const srcH = Math.min(340, Math.max(90, Math.floor(p.viewHeight * 0.55)));
        const msaa = 1;
        const scaleX = srcW / Math.max(p.viewWidth, 1);
        const scaleY = srcH / Math.max(p.viewHeight, 1);
        const rgba = Pcb3dPbrRaster.render(mesh, {
            width: srcW,
            height: srcH,
            msaa,
            ortho: p.ortho,
            yawDeg: p.yawDeg,
            pitchDeg: p.pitchDeg,
            zoom: p.zoom * scaleX,
            panX: p.panX * scaleX,
            panY: p.panY * scaleY,
            boardCx,
            boardCy,
            worldScale: 1
        });
        ctx.fillStyle = '#1A2030';
        ctx.fillRect(0, 0, p.viewWidth, p.viewHeight);
        Pcb3dPbrRaster.blitToCanvas(ctx, rgba, srcW, srcH, 0, 0, p.viewWidth, p.viewHeight);
        // 暗角
        const vg = ctx.createRadialGradient(p.viewWidth / 2, p.viewHeight / 2, p.viewWidth * 0.40, p.viewWidth / 2, p.viewHeight / 2, p.viewWidth * 0.90);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.50, 'rgba(0,0,0,0.03)');
        vg.addColorStop(1, 'rgba(0,0,0,0.40)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, p.viewWidth, p.viewHeight);
        ctx.fillStyle = 'rgba(14,18,26,0.82)';
        ctx.fillRect(8, 8, 540, 46);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`3D · PBR GGX · ${srcW}x${srcH} · ${mesh.tris.length} tris`, 16, 24);
        ctx.fillStyle = 'rgba(180,210,255,0.92)';
        ctx.font = '11px sans-serif';
        ctx.fillText(`yaw ${p.yawDeg.toFixed(0)}°  pitch ${p.pitchDeg.toFixed(0)}° · 三点光 · CookTorrance · ACES`, 16, 44);
        let yawDeg = p.yawDeg;
        let pitchDeg = p.pitchDeg;
        if (!(yawDeg >= -10000 && yawDeg <= 10000))
            yawDeg = 35;
        if (!(pitchDeg >= 8 && pitchDeg <= 88))
            pitchDeg = 55;
        const yaw = yawDeg * Math.PI / 180;
        const pitch = pitchDeg * Math.PI / 180;
        const cyaw = Math.cos(yaw);
        const syaw = Math.sin(yaw);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const zoom = Math.max(p.zoom, 0.05);
        const ox = p.viewWidth / 2 + p.panX;
        const oy = p.viewHeight / 2 + p.panY;
        const boardH = boardThicknessWorld(doc);
        const projectHud = (wx: number, wy: number, wz: number): Point2D => {
            const x0 = wx - boardCx;
            const y0 = wy - boardCy;
            const x1 = x0 * cyaw - y0 * syaw;
            const y1 = x0 * syaw + y0 * cyaw;
            const y2 = y1 * cp - wz * sp;
            let sx = x1 * zoom;
            let sy = y2 * zoom;
            // 默认正交，与 Canvas 主路径一致
            if (p.ortho === false) {
                const depth = y1 * sp + wz * cp;
                const sc = 1 / (1 + depth * 0.00022);
                sx *= sc;
                sy *= sc;
            }
            return { x: ox + sx, y: oy + sy };
        };
        if (p.selectedFpIds.length > 0) {
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = 2;
            for (let i = 0; i < doc.footprints.length; i++) {
                const fp = doc.footprints[i];
                let hit = false;
                for (let s = 0; s < p.selectedFpIds.length; s++) {
                    if (p.selectedFpIds[s] === fp.id) {
                        hit = true;
                        break;
                    }
                }
                if (!hit)
                    continue;
                const c = projectHud(fp.position.x, fp.position.y, boardH + 20);
                ctx.beginPath();
                ctx.arc(c.x, c.y, 16, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        if (p.measurePts.length > 0) {
            ctx.fillStyle = '#00E676';
            for (let i = 0; i < p.measurePts.length; i++) {
                const sp2 = projectHud(p.measurePts[i].x, p.measurePts[i].y, boardH + 6);
                ctx.beginPath();
                ctx.arc(sp2.x, sp2.y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            if (p.measurePts.length >= 2) {
                const a = p.measurePts[0];
                const b = p.measurePts[1];
                const pa = projectHud(a.x, a.y, boardH + 6);
                const pb = projectHud(b.x, b.y, boardH + 6);
                ctx.strokeStyle = '#00E676';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
                const dMil = dist3(a, b);
                ctx.fillStyle = '#00E676';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`${dMil.toFixed(1)} mil`, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - 8);
            }
        }
        if (p.showInterference) {
            const issues = detectInterference(doc, 8);
            ctx.strokeStyle = '#FF1744';
            ctx.lineWidth = 2;
            for (let ii = 0; ii < issues.length; ii++) {
                let ax = 0;
                let ay = 0;
                let bx = 0;
                let by = 0;
                let fa = false;
                let fb = false;
                for (let fi = 0; fi < doc.footprints.length; fi++) {
                    if (doc.footprints[fi].id === issues[ii].aId) {
                        ax = doc.footprints[fi].position.x;
                        ay = doc.footprints[fi].position.y;
                        fa = true;
                    }
                    if (doc.footprints[fi].id === issues[ii].bId) {
                        bx = doc.footprints[fi].position.x;
                        by = doc.footprints[fi].position.y;
                        fb = true;
                    }
                }
                if (!fa || !fb)
                    continue;
                const pa = projectHud(ax, ay, boardH + 18);
                const pb = projectHud(bx, by, boardH + 18);
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
            }
            ctx.fillStyle = issues.length > 0 ? '#FF1744' : '#00E676';
            ctx.font = '11px sans-serif';
            ctx.fillText(issues.length > 0 ? `干涉 ${issues.length}` : '无干涉', 16, 62);
        }
    }
    static pick(doc: PcbDocument, p: Pcb3dViewParams, sx: number, sy: number): Pcb3dHit | null {
        let yawDeg = p.yawDeg;
        let pitchDeg = p.pitchDeg;
        if (!(yawDeg >= -10000 && yawDeg <= 10000))
            yawDeg = 35;
        if (!(pitchDeg >= 8 && pitchDeg <= 88))
            pitchDeg = 55;
        const yaw = yawDeg * Math.PI / 180;
        const pitch = pitchDeg * Math.PI / 180;
        const cyaw = Math.cos(yaw);
        const syaw = Math.sin(yaw);
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const outline = doc.boardOutline.points;
        let boardCx = 0;
        let boardCy = 0;
        if (outline.length > 0) {
            for (let i = 0; i < outline.length; i++) {
                boardCx += outline[i].x;
                boardCy += outline[i].y;
            }
            boardCx /= outline.length;
            boardCy /= outline.length;
        }
        const zoom = Math.max(p.zoom, 0.05);
        const boardH = boardThicknessWorld(doc);
        const ox = p.viewWidth / 2 + p.panX;
        const oy = p.viewHeight / 2 + p.panY;
        const ortho = p.ortho;
        const perspK = ortho ? 0 : 0.00022;
        const project: ProjectFn = (wx: number, wy: number, wz: number): Point2D => {
            const x0 = wx - boardCx;
            const y0 = wy - boardCy;
            const x1 = x0 * cyaw - y0 * syaw;
            const y1 = x0 * syaw + y0 * cyaw;
            const y2 = y1 * cp - wz * sp;
            let px = x1 * zoom;
            let py = y2 * zoom;
            if (!ortho) {
                const depth = y1 * sp + wz * cp;
                const scale = 1 / (1 + depth * perspK);
                px *= scale;
                py *= scale;
            }
            return { x: ox + px, y: oy + py };
        };
        return hitTest3d(doc, project, boardH, sx, sy);
    }
    static listInterference(doc: PcbDocument): Pcb3dInterference[] {
        return detectInterference(doc, 8);
    }
    /**
     * 分面绘制铜：bottomOnly=true 只画板底侧（B.Cu 等），否则画顶侧。
     * 底层铜在板体/阻焊之后绘制（painter 后画先见），才能看见过孔后的铺铜。
     */
    private static drawCopperPass(ctx: CanvasRenderingContext2D, project: ProjectFn, depthOf: (wx: number, wy: number, wz: number) => number, doc: PcbDocument, p: Pcb3dViewParams, boardH: number, copperOrder: PcbLayerId[], explode: boolean, explodeGap: number, cutaway: boolean, cutX: number | null, hasHl: boolean, hl: string, dim: number, cuH: number, zoom: number, lodFar: boolean, bottomOnly: boolean): void {
        const selTrk = new Set(p.selectedTrackIds);
        // 底层铺铜即使远距 LOD 也要画，否则过孔后 GND 连接会“消失”
        const drawZones = !p.hideZones && (bottomOnly || !lodFar);
        if (drawZones) {
            for (let zi = 0; zi < doc.zones.length; zi++) {
                const zn = doc.zones[zi];
                if (!isCopperLayer(zn.layer) || zn.outline.length < 3)
                    continue;
                if (!copperDrawOk(doc, zn.layer, p))
                    continue;
                const bottom = isBottomSideCopper(zn.layer, copperOrder, doc.layerStack);
                if (bottomOnly !== bottom)
                    continue;
                let cx = 0;
                let cy = 0;
                for (let pi = 0; pi < zn.outline.length; pi++) {
                    cx += zn.outline[pi].x;
                    cy += zn.outline[pi].y;
                }
                cx /= zn.outline.length;
                cy /= zn.outline.length;
                if (cutaway && cutX !== null && isCutAway(cx, cutX))
                    continue;
                const zMid = copperWorldZ(zn.layer, boardH, copperOrder, explode, explodeGap, doc.layerStack);
                const zOp = layerOpacity(doc, zn.layer) * copperLayerDimFactor(zn.layer, p);
                // 铜层填充：底侧略亮（半透明板体后仍可见），顶侧保持淡色透出
                let a = bottomOnly
                    ? Math.min(0.72, 0.38 * Math.max(0.08, zOp))
                    : Math.min(0.52, 0.28 * Math.max(0.08, zOp));
                if (a <= 0.04)
                    continue;
                // 突出 B.Cu 时铺铜加亮
                if (bottomOnly && p.appearanceMode === PcbAppearanceMode.DIM_INACTIVE &&
                    p.activeLayer === PcbLayerId.B_CU) {
                    a = Math.min(0.9, Math.max(0.55, a + 0.35));
                }
                else if (bottomOnly && p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY) {
                    a = Math.min(0.92, Math.max(0.6, a + 0.25));
                }
                else if (!bottomOnly && p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY) {
                    a = Math.min(0.8, a + 0.12);
                }
                if (hasHl && zn.netId !== hl)
                    a *= dim;
                const zCol = layerColor(doc, zn.layer);
                ctx.fillStyle = hexAlpha(zCol, a);
                ctx.beginPath();
                for (let i = 0; i < zn.outline.length; i++) {
                    const pt = project(zn.outline[i].x, zn.outline[i].y, zMid);
                    if (i === 0)
                        ctx.moveTo(pt.x, pt.y);
                    else
                        ctx.lineTo(pt.x, pt.y);
                }
                ctx.closePath();
                if (zn.cutouts !== undefined) {
                    for (let ci = 0; ci < zn.cutouts.length; ci++) {
                        const cut = zn.cutouts[ci];
                        if (cut.length < 3)
                            continue;
                        const last = cut.length - 1;
                        const pLast = project(cut[last].x, cut[last].y, zMid);
                        ctx.moveTo(pLast.x, pLast.y);
                        for (let i = last - 1; i >= 0; i--) {
                            const pt = project(cut[i].x, cut[i].y, zMid);
                            ctx.lineTo(pt.x, pt.y);
                        }
                        ctx.closePath();
                    }
                }
                ctx.fill('evenodd');
                // 铺铜内晕：沿轮廓内侧微提亮，模拟铜箔边缘高光
                if (!lodFar && a > 0.12) {
                    ctx.strokeStyle = hexAlpha(zCol, Math.min(0.45, a + 0.10));
                    ctx.lineWidth = 3.5;
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    for (let i = 0; i < zn.outline.length; i++) {
                        const pt = project(zn.outline[i].x, zn.outline[i].y, zMid + 0.2);
                        if (i === 0)
                            ctx.moveTo(pt.x, pt.y);
                        else
                            ctx.lineTo(pt.x, pt.y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
                // 仅外轮廓细描；挖空框不描边（避免满屏橙色框线）
                ctx.strokeStyle = hexAlpha(bottomOnly ? '#69F0AE' : zCol, Math.min(0.75, a + 0.15));
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                for (let i = 0; i < zn.outline.length; i++) {
                    const pt = project(zn.outline[i].x, zn.outline[i].y, zMid + 0.4);
                    if (i === 0)
                        ctx.moveTo(pt.x, pt.y);
                    else
                        ctx.lineTo(pt.x, pt.y);
                }
                ctx.closePath();
                ctx.stroke();
                // 热焊盘：只填充筋，不描黄边框
                if (zn.thermalRelief === true && !lodFar) {
                    const tw = Math.max(zn.thermalWidth !== undefined ? zn.thermalWidth : 10, 6);
                    const gap = zn.thermalGap !== undefined ? zn.thermalGap : 12;
                    const spokeA = Math.min(0.9, a + 0.25);
                    ctx.fillStyle = hexAlpha(zCol, spokeA);
                    for (let fi = 0; fi < doc.footprints.length; fi++) {
                        const fp = doc.footprints[fi];
                        for (let pi = 0; pi < fp.pads.length; pi++) {
                            const pad = fp.pads[pi];
                            if (pad.netId !== zn.netId)
                                continue;
                            const wx = padWorldPosition(fp, pad);
                            const hw = Math.max(pad.size.x, 10) / 2;
                            const hh = Math.max(pad.size.y, 10) / 2;
                            const spokes: number[][] = [
                                [wx.x - hw - gap, wx.y, tw, hh * 2],
                                [wx.x + hw + gap, wx.y, tw, hh * 2],
                                [wx.x, wx.y - hh - gap, hw * 2, tw],
                                [wx.x, wx.y + hh + gap, hw * 2, tw]
                            ];
                            for (let si = 0; si < spokes.length; si++) {
                                const sx = spokes[si][0];
                                const sy = spokes[si][1];
                                const sw = spokes[si][2];
                                const sh = spokes[si][3];
                                const c00 = project(sx - sw / 2, sy - sh / 2, zMid + 0.6);
                                const c01 = project(sx + sw / 2, sy - sh / 2, zMid + 0.6);
                                const c11 = project(sx + sw / 2, sy + sh / 2, zMid + 0.6);
                                const c10 = project(sx - sw / 2, sy + sh / 2, zMid + 0.6);
                                ctx.beginPath();
                                ctx.moveTo(c00.x, c00.y);
                                ctx.lineTo(c01.x, c01.y);
                                ctx.lineTo(c11.x, c11.y);
                                ctx.lineTo(c10.x, c10.y);
                                ctx.closePath();
                                ctx.fill();
                            }
                        }
                    }
                    for (let vi = 0; vi < doc.vias.length; vi++) {
                        const v = doc.vias[vi];
                        if (v.netId !== zn.netId)
                            continue;
                        const hw = Math.max(v.diameter, 12) / 2;
                        const spokesV: number[][] = [
                            [v.position.x - hw - gap, v.position.y, tw, hw * 2],
                            [v.position.x + hw + gap, v.position.y, tw, hw * 2],
                            [v.position.x, v.position.y - hw - gap, hw * 2, tw],
                            [v.position.x, v.position.y + hw + gap, hw * 2, tw]
                        ];
                        for (let si = 0; si < spokesV.length; si++) {
                            const sx = spokesV[si][0];
                            const sy = spokesV[si][1];
                            const sw = spokesV[si][2];
                            const sh = spokesV[si][3];
                            const c00 = project(sx - sw / 2, sy - sh / 2, zMid + 0.7);
                            const c01 = project(sx + sw / 2, sy - sh / 2, zMid + 0.7);
                            const c11 = project(sx + sw / 2, sy + sh / 2, zMid + 0.7);
                            const c10 = project(sx - sw / 2, sy + sh / 2, zMid + 0.7);
                            ctx.beginPath();
                            ctx.moveTo(c00.x, c00.y);
                            ctx.lineTo(c01.x, c01.y);
                            ctx.lineTo(c11.x, c11.y);
                            ctx.lineTo(c10.x, c10.y);
                            ctx.closePath();
                            ctx.fill();
                        }
                    }
                }
                if (hasHl && zn.netId === hl) {
                    const lab = project(zn.outline[0].x, zn.outline[0].y, zMid + 1);
                    const netNm = (zn.netName !== undefined && zn.netName.length > 0) ? zn.netName : zn.layer;
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    const tag = `${netNm} @ ${zn.layer}`;
                    const tw = Math.max(72, tag.length * 6.2);
                    ctx.fillStyle = 'rgba(10,14,22,0.65)';
                    ctx.fillRect(lab.x + 4, lab.y - 16, tw, 14);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(tag, lab.x + 8, lab.y - 4);
                }
            }
        }
        const filtered: PcbTrack[] = [];
        for (let ti = 0; ti < doc.tracks.length; ti++) {
            const trk = doc.tracks[ti];
            if (!isCopperLayer(trk.layer))
                continue;
            if (!copperDrawOk(doc, trk.layer, p))
                continue;
            const bottom = isBottomSideCopper(trk.layer, copperOrder, doc.layerStack);
            if (bottomOnly !== bottom)
                continue;
            const mx = (trk.start.x + trk.end.x) / 2;
            if (cutaway && cutX !== null && isCutAway(mx, cutX))
                continue;
            filtered.push(trk);
        }
        const polys = buildTrackPolylines(filtered);
        const polyDraws: PolyDraw[] = [];
        for (let pi = 0; pi < polys.length; pi++) {
            const poly = polys[pi];
            if (poly.points.length < 2)
                continue;
            let cx = 0;
            let cy = 0;
            for (let i = 0; i < poly.points.length; i++) {
                cx += poly.points[i].x;
                cy += poly.points[i].y;
            }
            cx /= poly.points.length;
            cy /= poly.points.length;
            const zMid = copperWorldZ(poly.layer, boardH, copperOrder, explode, explodeGap, doc.layerStack);
            polyDraws.push({ poly, depth: depthOf(cx, cy, zMid) });
        }
        polyDraws.sort((a: PolyDraw, b: PolyDraw) => a.depth - b.depth);
        for (let i = 0; i < polyDraws.length; i++) {
            const poly = polyDraws[i].poly;
            const zMid = copperWorldZ(poly.layer, boardH, copperOrder, explode, explodeGap, doc.layerStack);
            const z0 = zMid - cuH * 0.35;
            const z1 = zMid + cuH * 0.65;
            let selected = false;
            for (let k = 0; k < poly.trackIds.length; k++) {
                if (selTrk.has(poly.trackIds[k])) {
                    selected = true;
                    break;
                }
            }
            const faded = hasHl && poly.netId !== hl;
            const dimL = copperLayerDimFactor(poly.layer, p);
            let alpha = faded ? dim : layerOpacity(doc, poly.layer) * dimL;
            if (alpha <= 0.05)
                continue;
            // 透明度完全跟图层面板，不再强制抬到 0.85
            if (bottomOnly && !faded && alpha > 0.2)
                alpha = Math.min(1, alpha + 0.05);
            const col = layerColor(doc, poly.layer);
            Pcb3dRenderer.drawPolylineExtruded(ctx, project, poly, z0, z1, zoom, lodFar, alpha, selected, col);
        }
    }
    /**
     * 铜箔走线：金属质感三层渲染（暗基+铜色+高光边）
     */
    private static drawPolylineExtruded(ctx: CanvasRenderingContext2D, project: ProjectFn, poly: PcbTrackPolyline, z0: number, z1: number, zoom: number, lodFar: boolean, alpha: number, selected: boolean, copperCol: string): void {
        if (poly.points.length < 2)
            return;
        const w = Math.max(2.0, poly.width * zoom * 0.94);
        const zSurf = z1;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 2.5;
        // 侧壁阴影（极薄暗带模拟铜箔厚度）
        if (!lodFar && Math.abs(z1 - z0) > 0.5) {
            ctx.strokeStyle = hexAlpha('#2A1808', 0.30 * alpha);
            ctx.lineWidth = w + 1.0;
            ctx.beginPath();
            const s0 = project(poly.points[0].x, poly.points[0].y, z0);
            ctx.moveTo(s0.x, s0.y);
            for (let i = 1; i < poly.points.length; i++) {
                const pt = project(poly.points[i].x, poly.points[i].y, z0);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        }
        // 铜箔主体 — 暗底色
        ctx.strokeStyle = hexAlpha('#8B5528', alpha);
        ctx.lineWidth = w;
        ctx.beginPath();
        const s1 = project(poly.points[0].x, poly.points[0].y, zSurf);
        ctx.moveTo(s1.x, s1.y);
        for (let i = 1; i < poly.points.length; i++) {
            const pt = project(poly.points[i].x, poly.points[i].y, zSurf);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        // 铜箔 — 亮面色
        ctx.strokeStyle = hexAlpha(copperCol, alpha * 0.85);
        ctx.lineWidth = w * 0.75;
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        for (let i = 1; i < poly.points.length; i++) {
            const pt = project(poly.points[i].x, poly.points[i].y, zSurf);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        // 金属高光细线
        ctx.strokeStyle = hexAlpha(Mat3d.COPPER_HI, 0.38 * alpha);
        ctx.lineWidth = Math.max(1.2, w * 0.28);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        for (let i = 1; i < poly.points.length; i++) {
            const pt = project(poly.points[i].x, poly.points[i].y, zSurf);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        // 拐点填平（圆形端点，避免方形白斑）
        const half = w * 0.42;
        ctx.fillStyle = hexAlpha(copperCol, alpha * 0.85);
        for (let i = 0; i < poly.points.length; i++) {
            const c = project(poly.points[i].x, poly.points[i].y, zSurf);
            fillEllipse(ctx, c.x, c.y, half, half * 0.72);
        }
        if (selected) {
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = w + 3;
            ctx.globalAlpha = 0.50;
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            for (let i = 1; i < poly.points.length; i++) {
                const pt = project(poly.points[i].x, poly.points[i].y, zSurf);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
    private static drawTrackExtruded(ctx: CanvasRenderingContext2D, project: ProjectFn, trk: PcbTrack, z0: number, z1: number, zoom: number, lodFar: boolean, alpha: number, selected: boolean, copperCol: string = Mat3d.COPPER): void {
        const s0 = project(trk.start.x, trk.start.y, z0);
        const e0 = project(trk.end.x, trk.end.y, z0);
        const s1 = project(trk.start.x, trk.start.y, z1);
        const e1 = project(trk.end.x, trk.end.y, z1);
        const w = Math.max(2.0, trk.width * zoom * 0.85);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // 侧影（挤出侧面近似）
        if (!lodFar) {
            ctx.strokeStyle = hexAlpha('#6B4420', 0.55 * alpha);
            ctx.lineWidth = w + 1.2;
            ctx.beginPath();
            ctx.moveTo(s0.x, s0.y);
            ctx.lineTo(e0.x, e0.y);
            ctx.stroke();
        }
        // 按铜层着色：F.Cu 红 / B.Cu 绿，便于辨认所在层
        ctx.strokeStyle = hexAlpha(copperCol, alpha);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.stroke();
        // 金属高光
        ctx.strokeStyle = hexAlpha(Mat3d.COPPER_HI, 0.35 * alpha);
        ctx.lineWidth = Math.max(1, w * 0.32);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.stroke();
        if (selected) {
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = w + 3;
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(e1.x, e1.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
    /** 通孔：整段等径金黄圆柱 + 等径钻孔（顶底与孔壁同色同粗） */
    private static drawViaBarrel(ctx: CanvasRenderingContext2D, project: ProjectFn, x: number, y: number, zBot: number, zTop: number, outerR: number, drillR: number, zoom: number, flatY: number, plated: boolean, detail: boolean, alpha: number, selected: boolean, kind: PcbViaKind): void {
        // 外径全程=焊盘外径；内孔全程=钻孔，禁止中间收细
        const ro = Math.max(2.2, outerR * zoom);
        const ri = Math.max(1.0, Math.min(drillR * zoom, ro * 0.55));
        const flat = Math.min(0.92, flatY + 0.06);
        const ry = Math.max(1.2, ro * flat);
        const riy = Math.max(0.8, ri * flat);
        let goldDark = '#D4B028';
        let goldMid = '#F0D050';
        let goldLit = '#FFE870';
        let goldHi = '#FFF8C0';
        if (kind === PcbViaKind.BLIND) {
            goldDark = '#D8B830';
            goldMid = '#F5DC58';
            goldLit = '#FFE878';
            goldHi = '#FFFAD0';
        }
        else if (kind === PcbViaKind.BURIED) {
            goldDark = '#505058';
            goldMid = '#888890';
            goldLit = '#B0B0B8';
            goldHi = '#D0D0D8';
        }
        const top = project(x, y, zTop);
        const bot = project(x, y, zBot);
        const dx = top.x - bot.x;
        const dy = top.y - bot.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = (-dy / len) * ro;
        const ny = (dx / len) * ro;
        const nix = (-dy / len) * ri;
        const niy = (dx / len) * ri;
        if (plated && alpha > 0.25) {
            ctx.fillStyle = hexAlpha('#000000', 0.08 * alpha);
            fillEllipse(ctx, bot.x, bot.y, ro * 1.06, ry * 1.06);
        }
        if (plated && len > 2.5) {
            const bands = detail ? 6 : 4;
            const cols = detail
                ? [goldDark, goldMid, goldLit, goldHi, goldLit, goldMid]
                : [goldDark, goldLit, goldHi, goldMid];
            const alphas = detail
                ? [0.95, 0.98, 1.0, 0.75, 0.98, 0.95]
                : [0.95, 1.0, 0.72, 0.95];
            for (let b = 0; b < bands; b++) {
                const t0 = -1 + (2 * b) / bands;
                const t1 = -1 + (2 * (b + 1)) / bands;
                ctx.fillStyle = hexAlpha(cols[b], alphas[b] * alpha);
                ctx.beginPath();
                ctx.moveTo(bot.x + nx * t0, bot.y + ny * t0);
                ctx.lineTo(top.x + nx * t0, top.y + ny * t0);
                ctx.lineTo(top.x + nx * t1, top.y + ny * t1);
                ctx.lineTo(bot.x + nx * t1, bot.y + ny * t1);
                ctx.closePath();
                ctx.fill();
            }
            if (detail) {
                ctx.strokeStyle = hexAlpha(goldHi, 0.60 * alpha);
                ctx.lineWidth = Math.max(1.0, ro * 0.12);
                ctx.beginPath();
                ctx.moveTo(bot.x + nx * 0.22, bot.y + ny * 0.22);
                ctx.lineTo(top.x + nx * 0.22, top.y + ny * 0.22);
                ctx.stroke();
            }
            // 内孔与顶底同径 ri
            ctx.fillStyle = hexAlpha('#14120C', 0.92 * alpha);
            ctx.beginPath();
            ctx.moveTo(bot.x + nix, bot.y + niy);
            ctx.lineTo(top.x + nix, top.y + niy);
            ctx.lineTo(top.x - nix, top.y - niy);
            ctx.lineTo(bot.x - nix, bot.y - niy);
            ctx.closePath();
            ctx.fill();
        }
        if (plated) {
            ctx.fillStyle = hexAlpha(goldDark, 0.92 * alpha);
            fillEllipse(ctx, bot.x, bot.y, ro, ry);
            ctx.fillStyle = hexAlpha(goldMid, 0.98 * alpha);
            fillEllipse(ctx, bot.x, bot.y, ro * 0.92, ry * 0.92);
        }
        else {
            ctx.fillStyle = hexAlpha(Mat3d.FR4_EDGE, 0.9 * alpha);
            fillEllipse(ctx, bot.x, bot.y, ro, ry);
        }
        ctx.fillStyle = hexAlpha('#14120C', 0.95 * alpha);
        fillEllipse(ctx, bot.x, bot.y, ri, riy);
        if (plated) {
            ctx.fillStyle = hexAlpha(goldDark, 0.90 * alpha);
            fillEllipse(ctx, top.x, top.y, ro, ry);
            ctx.fillStyle = hexAlpha(goldMid, alpha);
            fillEllipse(ctx, top.x, top.y, ro * 0.92, ry * 0.92);
            ctx.fillStyle = hexAlpha(goldHi, 0.32 * alpha);
            fillEllipse(ctx, top.x - ro * 0.16, top.y - ry * 0.20, ro * 0.40, ry * 0.26);
            ctx.strokeStyle = hexAlpha(goldDark, 0.50 * alpha);
            ctx.lineWidth = 0.8;
            strokeEllipse(ctx, top.x, top.y, ro, ry);
        }
        else {
            ctx.fillStyle = hexAlpha(Mat3d.FR4_EDGE, alpha);
            fillEllipse(ctx, top.x, top.y, ro, ry);
        }
        // 顶孔只用 ri，禁止更小内圈黑斑
        ctx.fillStyle = hexAlpha('#14120C', 0.96 * alpha);
        fillEllipse(ctx, top.x, top.y, ri, riy);
        if (detail) {
            ctx.strokeStyle = hexAlpha(goldMid, 0.45 * alpha);
            ctx.lineWidth = Math.max(0.7, (ro - ri) * 0.15);
            strokeEllipse(ctx, top.x, top.y, ri, riy);
        }
        if (kind === PcbViaKind.BLIND) {
            ctx.strokeStyle = hexAlpha('#FFE870', 0.55 * alpha);
            ctx.lineWidth = 1.0;
            strokeEllipse(ctx, top.x, top.y, ro + 1.8, ry + 1.2);
        }
        else if (kind === PcbViaKind.BURIED) {
            ctx.strokeStyle = hexAlpha('#8890A0', 0.45 * alpha);
            ctx.lineWidth = 0.9;
            ctx.setLineDash([2, 3]);
            strokeEllipse(ctx, top.x, top.y, ro + 1.6, ry + 1.1);
            ctx.setLineDash([]);
        }
        if (selected) {
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = 2.2;
            strokeEllipse(ctx, top.x, top.y, ro + 2.8, ry + 2.0);
        }
    }
    private static drawPads(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number, flatY: number, boardH: number, cuH: number, detail: boolean, drawBarrels: boolean = true): void {
        const fp = item.fp;
        const z = item.zBase + cuH * 0.85;
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            if (pad.type === PcbPadType.TH || item.kind === 'mount') {
                const w = localRot(pad.pos.x, pad.pos.y, fp);
                const drill = pad.drill !== undefined ? pad.drill / 2 : Math.max(pad.size.x, pad.size.y) * 0.22;
                // 焊盘外径钳制，避免侧壁画成巨大帘幕
                const outer = Math.min(Math.max(pad.size.x, pad.size.y) / 2, Math.max(drill * 2.2, 8));
                const plated = item.kind !== 'mount' && pad.type !== PcbPadType.NPTH;
                if (drawBarrels) {
                    Pcb3dRenderer.drawViaBarrel(ctx, project, w.x, w.y, 2, boardH, outer, drill, zoom, flatY, plated, detail, 1, false, PcbViaKind.THROUGH);
                }
                else {
                    // 丝印聚焦：只画顶面焊环，不穿板
                    const top = project(w.x, w.y, boardH);
                    const ro = Math.max(2.2, outer * zoom);
                    const ri = Math.max(1.0, drill * zoom);
                    const ry = Math.max(1.2, ro * 0.55);
                    ctx.fillStyle = plated ? Mat3d.ENIG : Mat3d.FR4_EDGE;
                    fillEllipse(ctx, top.x, top.y, ro, ry);
                    ctx.fillStyle = '#0A0A0A';
                    fillEllipse(ctx, top.x, top.y, ri, ri * 0.55);
                }
            }
            else {
                const hx = pad.size.x / 2;
                const hy = pad.size.y / 2;
                fillBoardQuad(ctx, project, fp, pad.pos.x - hx, pad.pos.y - hy, pad.pos.x + hx, pad.pos.y + hy, item.zBase + 0.5, Mat3d.COPPER);
                fillBoardQuad(ctx, project, fp, pad.pos.x - hx, pad.pos.y - hy, pad.pos.x + hx, pad.pos.y + hy, z, Mat3d.HASL, Mat3d.PIN_HI);
            }
        }
    }
    private static drawSelectionHalo(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw): void {
        const z = item.zBase + item.bodyH + 1;
        fillBoardQuad(ctx, project, item.fp, -item.hw - 6, -item.hh - 6, item.hw + 6, item.hh + 6, z, 'rgba(0,229,255,0.12)', '#00E5FF');
    }
    private static drawComponent(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number, lodFar: boolean, flatY: number, heightmap: boolean, boardH: number): void {
        const kind = item.kind;
        if (kind === 'mount')
            return;
        if (heightmap) {
            const norm = Math.min(1, (item.zBase + item.bodyH) / (boardH + 80));
            const col = heightHeatColor(norm);
            drawExtrudedBox(ctx, project, item.fp, -item.hw, -item.hh, item.hw, item.hh, item.zBase + 1.2, item.zBase + item.bodyH, col, col, col);
            return;
        }
        // 电解电容
        if (kind === 'elec') {
            Pcb3dRenderer.drawElecCap(ctx, project, item, zoom, flatY);
            return;
        }
        // SMD 片式
        if (kind === 'smd' || kind === 'res' || kind === 'cap' || kind === 'ind' || kind === 'fuse') {
            Pcb3dRenderer.drawSmdChip(ctx, project, item, kind, lodFar);
            return;
        }
        // LED
        if (kind === 'led') {
            Pcb3dRenderer.drawLed(ctx, project, item, zoom);
            return;
        }
        // 二极管 / BJT / MOSFET
        if (kind === 'diode') {
            Pcb3dRenderer.drawDiode(ctx, project, item, zoom);
            return;
        }
        if (kind === 'bjt') {
            Pcb3dRenderer.drawBjt(ctx, project, item, zoom);
            return;
        }
        if (kind === 'mosfet') {
            Pcb3dRenderer.drawMosfet(ctx, project, item, zoom);
            return;
        }
        // 电位器
        if (kind === 'pot') {
            Pcb3dRenderer.drawPot(ctx, project, item, zoom, flatY);
            return;
        }
        // 晶振
        if (kind === 'xtal') {
            Pcb3dRenderer.drawXtal(ctx, project, item, zoom);
            return;
        }
        // 连接器
        if (kind === 'header') {
            Pcb3dRenderer.drawHeader(ctx, project, item, zoom);
            return;
        }
        if (kind === 'to220') {
            Pcb3dRenderer.drawTo220(ctx, project, item);
            return;
        }
        if (kind === 'tht') {
            Pcb3dRenderer.drawAxial(ctx, project, item, zoom);
            return;
        }
        // 开关 / 继电器 / 蜂鸣器
        if (kind === 'switch') {
            Pcb3dRenderer.drawSwitch(ctx, project, item, zoom);
            return;
        }
        if (kind === 'relay') {
            Pcb3dRenderer.drawRelay(ctx, project, item, zoom);
            return;
        }
        if (kind === 'buzzer') {
            Pcb3dRenderer.drawBuzzer(ctx, project, item, zoom);
            return;
        }
        // 显示屏
        if (kind === 'lcd') {
            Pcb3dRenderer.drawLcd(ctx, project, item, zoom);
            return;
        }
        if (kind === 'oled') {
            Pcb3dRenderer.drawOled(ctx, project, item, zoom);
            return;
        }
        // 传感器
        if (kind === 'sensor_to92') {
            Pcb3dRenderer.drawSensorTo92(ctx, project, item, zoom);
            return;
        }
        if (kind === 'sensor_sip') {
            Pcb3dRenderer.drawSensorSip(ctx, project, item, zoom);
            return;
        }
        if (kind === 'ldr') {
            Pcb3dRenderer.drawLdr(ctx, project, item, zoom);
            return;
        }
        // 仪器探针
        if (kind === 'instrument') {
            Pcb3dRenderer.drawInstrument(ctx, project, item, zoom);
            return;
        }
        if (kind === 'terminal') {
            Pcb3dRenderer.drawTerminal(ctx, project, item);
            return;
        }
        const hw = item.hw;
        const hh = item.hh;
        const z0 = item.zBase + 1.2;
        const z1 = item.zBase + item.bodyH;
        const fp = item.fp;
        // 塑封体：略收顶面，形成斜边/倒角感
        drawExtrudedBox(ctx, project, fp, -hw, -hh, hw, hh, z0, z1 - 1.2, Mat3d.PLASTIC, '#2A2A34', '#484850');
        drawExtrudedBox(ctx, project, fp, -hw * 0.94, -hh * 0.94, hw * 0.94, hh * 0.94, z1 - 1.2, z1, Mat3d.PLASTIC_TOP, Mat3d.PLASTIC, '#585868');
        // 顶面微倒角高光（迎光一侧）
        fillBoardQuad(ctx, project, fp, -hw * 0.88, -hh * 0.88, hw * 0.35, -hh * 0.55, z1 + 0.15, 'rgba(255,255,255,0.10)');
        // 激光刻字区（板面投影，禁止屏幕 fillRect）
        fillBoardQuad(ctx, project, fp, -hw * 0.42, -hh * 0.28, hw * 0.55, hh * 0.28, z1 + 0.22, 'rgba(210,215,225,0.07)');
        // 侧边 pin-1 凹槽
        const notchY = -hh * 0.25;
        const notchW = localRot(-hw - 1, notchY, fp);
        const notchP = project(notchW.x, notchW.y, (z0 + z1) / 2);
        ctx.fillStyle = '#14141A';
        ctx.beginPath();
        ctx.arc(notchP.x, notchP.y, Math.max(2.2, 2.8 * Math.min(zoom, 1.4)), 0, Math.PI * 2);
        ctx.fill();
        // 顶面 pin-1 标记点
        const d = localRot(-hw * 0.62, -hh * 0.62, fp);
        const dp = project(d.x, d.y, z1 + 0.35);
        const dotR = Math.max(2.2, 2.8 * Math.min(zoom, 1.5));
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(210,215,225,0.28)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, dotR * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#0E0E14';
        ctx.fill();
        // gull-wing / 短引脚：根部略粗 + 金色贴盘
        if (!lodFar && fp.pads.length > 0) {
            for (let i = 0; i < fp.pads.length; i++) {
                const pad = fp.pads[i];
                if (pad.type === PcbPadType.TH)
                    continue;
                const tip = localRot(pad.pos.x, pad.pos.y, fp);
                const mid = localRot(pad.pos.x * 0.86, pad.pos.y * 0.86, fp);
                const root = localRot(pad.pos.x * 0.72, pad.pos.y * 0.72, fp);
                const a = project(root.x, root.y, z0 + 1.8);
                const m = project(mid.x, mid.y, z0 + 0.6);
                const b = project(tip.x, tip.y, item.zBase + 1.0);
                const lw = Math.max(1.1, Math.min(pad.size.x, pad.size.y) * zoom * 0.30);
                ctx.strokeStyle = Mat3d.PIN;
                ctx.lineWidth = lw;
                ctx.lineCap = 'butt';
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(m.x, m.y);
                ctx.stroke();
                ctx.strokeStyle = Mat3d.ENIG;
                ctx.lineWidth = lw * 0.92;
                ctx.beginPath();
                ctx.moveTo(m.x, m.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                // 引脚顶面微高光
                ctx.strokeStyle = Mat3d.PIN_HI;
                ctx.lineWidth = Math.max(0.6, lw * 0.28);
                ctx.beginPath();
                ctx.moveTo(a.x - 0.4, a.y);
                ctx.lineTo(m.x - 0.4, m.y);
                ctx.stroke();
            }
        }
    }
    /** SMD 片式元件：高细节渲染 */
    private static drawSmdChip(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, kind: string, lodFar: boolean): void {
        const fp = item.fp;
        let maxX = 18;
        let maxY = 10;
        for (let i = 0; i < fp.pads.length; i++) {
            maxX = Math.max(maxX, Math.abs(fp.pads[i].pos.x));
            maxY = Math.max(maxY, fp.pads[i].size.y / 2);
        }
        const bodyHalfX = Math.max(8, maxX * 0.40);
        const bodyHalfY = Math.max(5, Math.min(maxY * 0.88, 12));
        const z0 = item.zBase + 0.8;
        const z1 = item.zBase + Math.max(item.bodyH, kind === 'cap' ? 10 : 7);
        // 主体材质
        let topCol = Mat3d.PLASTIC_TOP;
        let sideCol = Mat3d.PLASTIC;
        let edgeCol = '#585868';
        let termCol = Mat3d.PIN;
        let termHi = Mat3d.PIN_HI;
        if (kind === 'cap') {
            topCol = Mat3d.CERAMIC_LIT;
            sideCol = Mat3d.CERAMIC;
            edgeCol = '#E8D8A0';
            termCol = '#C0C0C8';
            termHi = '#E8E8F0';
        }
        else if (kind === 'res') {
            topCol = '#383840';
            sideCol = '#202028';
            edgeCol = '#585860';
        }
        // 元件体
        drawExtrudedBox(ctx, project, fp, -bodyHalfX, -bodyHalfY, bodyHalfX, bodyHalfY, z0, z1, topCol, sideCol, edgeCol);
        // 顶面光泽带
        fillBoardQuad(ctx, project, fp, -bodyHalfX * 0.72, -bodyHalfY * 0.62, bodyHalfX * 0.35, bodyHalfY * 0.62, z1 + 0.15, 'rgba(255,255,255,0.12)');
        // 端子（端部金属帽）：与本体同高，形成真实电极厚度
        const termW = Math.max(5, maxX * 0.22);
        const termD = bodyHalfX + termW * 0.15;
        drawExtrudedBox(ctx, project, fp, -(termD + termW), -bodyHalfY * 0.95, -termD, bodyHalfY * 0.95, z0 - 0.4, z1 - 0.6, termHi, termCol, termHi);
        drawExtrudedBox(ctx, project, fp, termD, -bodyHalfY * 0.95, termD + termW, bodyHalfY * 0.95, z0 - 0.4, z1 - 0.6, termHi, termCol, termHi);
        // 端子与体连接处（焊接过渡线）
        fillBoardQuad(ctx, project, fp, -termD - 1.0, -bodyHalfY * 0.96, -termD + 0.5, bodyHalfY * 0.96, z0 - 0.15, '#B8B8C0');
        fillBoardQuad(ctx, project, fp, termD - 0.5, -bodyHalfY * 0.96, termD + 1.0, bodyHalfY * 0.96, z0 - 0.15, '#B8B8C0');
        // 元件体顶面标记
        if (!lodFar) {
            if (kind === 'cap') {
                // 极性条带（钽电容暗带）
                fillBoardQuad(ctx, project, fp, bodyHalfX * 0.35, -bodyHalfY * 0.80, bodyHalfX * 0.72, bodyHalfY * 0.80, z1 + 0.2, 'rgba(180,120,20,0.70)');
                // 极性 + 号
                const cxP = localRot(bodyHalfX * 0.54, 0, fp);
                const cp = project(cxP.x, cxP.y, z1 + 0.3);
                ctx.fillStyle = '#F0E0C0';
                ctx.font = `bold ${Math.max(7, 10 * Math.min(item.fp.rotation === 90 ? 0.7 : 1, 1.2))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', cp.x, cp.y);
            }
            else if (kind === 'res') {
                // 电阻色环（三条）
                const bandColors = ['#D04020', '#20A040', '#D08020'];
                for (let b = 0; b < 3; b++) {
                    const bx = -bodyHalfX * 0.5 + b * bodyHalfX * 0.45;
                    fillBoardQuad(ctx, project, fp, bx - 1.8, -bodyHalfY * 0.82, bx + 1.8, bodyHalfY * 0.82, z1 + 0.2, bandColors[b]);
                }
                // 精度环
                fillBoardQuad(ctx, project, fp, bodyHalfX * 0.55, -bodyHalfY * 0.82, bodyHalfX * 0.68, bodyHalfY * 0.82, z1 + 0.2, '#C8A830');
            }
        }
    }
    /** 排针/连接器：详细塑壳 + 方形引脚 */
    private static drawHeader(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        if (fp.pads.length === 0)
            return;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < fp.pads.length; i++) {
            minY = Math.min(minY, fp.pads[i].pos.y);
            maxY = Math.max(maxY, fp.pads[i].pos.y);
        }
        const baseW = 17;
        const padY = 12;
        const z0 = item.zBase + 1.0;
        const baseH = Math.max(10, item.bodyH * 0.16);
        // 塑壳主体 - 三层
        drawExtrudedBox(ctx, project, fp, -baseW, minY - padY, baseW, maxY + padY, z0, z0 + baseH, Mat3d.PLASTIC_TOP, Mat3d.PLASTIC, '#404048');
        // 塑壳上沿（稍宽）
        drawExtrudedBox(ctx, project, fp, -baseW - 2, minY - padY, baseW + 2, maxY + padY, z0 + baseH - 1.5, z0 + baseH, '#404048', '#2A2A32', '#4A4A52');
        // 顶面 pin-1 三角标记
        const tip1 = localRot(-baseW * 0.6, minY - padY * 0.2, fp);
        const tp = project(tip1.x, tip1.y, z0 + baseH + 0.2);
        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.moveTo(tp.x - 3, tp.y - 2);
        ctx.lineTo(tp.x + 3, tp.y - 2);
        ctx.lineTo(tp.x, tp.y + 3);
        ctx.closePath();
        ctx.fill();
        // 方形引脚
        const pinTop = z0 + item.bodyH;
        const pw = Math.max(2.2, 3.0 * Math.min(zoom, 1.5));
        for (let i = 0; i < fp.pads.length; i++) {
            const w = localRot(fp.pads[i].pos.x, fp.pads[i].pos.y, fp);
            const b = project(w.x, w.y, z0 + baseH);
            const t = project(w.x, w.y, pinTop);
            // 引脚主体（粗方线模拟方形截面）
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = pw;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
            // 引脚高光边
            ctx.strokeStyle = Mat3d.PIN_HI;
            ctx.lineWidth = pw * 0.35;
            ctx.beginPath();
            ctx.moveTo(b.x - pw * 0.2, b.y);
            ctx.lineTo(t.x - pw * 0.2, t.y);
            ctx.stroke();
            // 引脚顶部小方块（板面投影，随旋转）
            const tipHalf = Math.max(1.2, 2.2);
            fillBoardQuad(ctx, project, fp, fp.pads[i].pos.x - tipHalf, fp.pads[i].pos.y - tipHalf, fp.pads[i].pos.x + tipHalf, fp.pads[i].pos.y + tipHalf, pinTop + 0.2, Mat3d.PIN_HI);
        }
    }
    /** TO-220: 塑封体 + 金属散热片 + 安装孔 */
    private static drawTo220(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.2;
        const z1 = item.zBase + item.bodyH;
        // 塑封体
        drawExtrudedBox(ctx, project, fp, -33, -24, 33, 25, z0, z1, Mat3d.PLASTIC_TOP, Mat3d.PLASTIC, '#505058');
        // 塑封体正面斜面标记（pin-1 侧）
        fillBoardQuad(ctx, project, fp, -33, -24, -26, 25, z1 + 0.15, 'rgba(255,255,255,0.12)');
        // 金属散热片（下方延伸）
        const tabZ0 = z1 - 1.5;
        const tabZ1 = z1 + item.bodyH * 0.38;
        // 散热片暗侧
        drawExtrudedBox(ctx, project, fp, -29, -40, 29, -19, tabZ0, tabZ1, '#D0D4D8', '#A0A8B0', '#E0E4E8');
        // 散热片高光条
        fillBoardQuad(ctx, project, fp, -26, -38, 26, -30, tabZ1 + 0.1, 'rgba(255,255,255,0.25)');
        // 安装孔
        const holeX = 0;
        const holeY = -32;
        const holeW = localRot(holeX, holeY, fp);
        const hp = project(holeW.x, holeW.y, tabZ1 + 0.2);
        ctx.fillStyle = '#181820';
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, Math.max(3, 5 * Math.min(item.fp.rotation === 90 ? 0.7 : 1, 1.2)), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#888890';
        ctx.lineWidth = 1;
        ctx.stroke();
        // 引脚（三条，从塑封体引出到焊盘）
        for (let i = 0; i < fp.pads.length; i++) {
            const pad = fp.pads[i];
            const w = localRot(pad.pos.x, pad.pos.y, fp);
            const body = localRot(pad.pos.x * 0.35, 12, fp);
            const a = project(body.x, body.y, z0 + 2);
            const b = project(w.x, w.y, item.zBase + 1.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 2.4;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.strokeStyle = Mat3d.PIN_HI;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(a.x - 0.5, a.y);
            ctx.lineTo(b.x - 0.5, b.y);
            ctx.stroke();
        }
    }
    /** 轴向元件（二极管/电阻）：圆柱体 + 色环 + 引脚 */
    private static drawAxial(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const zMid = item.zBase + item.bodyH * 0.5;
        const mid = project(fp.position.x, fp.position.y, zMid);
        const r = Math.max(5, 9 * Math.min(zoom, 1.3));
        const ry = r * 0.55;
        // 主体圆柱
        ctx.fillStyle = '#2A3850';
        fillEllipse(ctx, mid.x, mid.y, r, ry);
        ctx.fillStyle = '#3A4870';
        fillEllipse(ctx, mid.x, mid.y, r * 0.92, ry * 0.90);
        // 高光
        ctx.fillStyle = 'rgba(200,220,255,0.28)';
        fillEllipse(ctx, mid.x - r * 0.2, mid.y - ry * 0.15, r * 0.55, ry * 0.30);
        // 色环（负极标记）
        ctx.fillStyle = '#101010';
        fillEllipse(ctx, mid.x - r * 0.25, mid.y, r * 0.12, ry);
        // 型号环
        ctx.fillStyle = '#FFFFFF';
        fillEllipse(ctx, mid.x + r * 0.15, mid.y, r * 0.08, ry);
        ctx.fillStyle = '#E04030';
        fillEllipse(ctx, mid.x + r * 0.30, mid.y, r * 0.08, ry);
        // 两端引脚
        for (let sign = -1; sign <= 1; sign += 2) {
            for (let pi = 0; pi < fp.pads.length; pi++) {
                const pad = fp.pads[pi];
                if (sign * pad.pos.x > 0) {
                    const w = localRot(pad.pos.x, pad.pos.y, fp);
                    const bp = project(w.x - sign * r * 0.5, w.y, zMid);
                    const ep = project(w.x, w.y, item.zBase + 1.5);
                    ctx.strokeStyle = Mat3d.PIN;
                    ctx.lineWidth = 1.8;
                    ctx.lineCap = 'butt';
                    ctx.beginPath();
                    ctx.moveTo(bp.x, bp.y);
                    ctx.lineTo(ep.x, ep.y);
                    ctx.stroke();
                }
            }
        }
    }
    /** LED：圆柱体 + 半球顶 + 发光色 */
    private static drawLed(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH * 0.6;
        const zTop = item.zBase + item.bodyH;
        const r = Math.max(6, 8 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = rad * 0.62;
        // 底座
        const bot = project(fp.position.x, fp.position.y, z0);
        const mid = project(fp.position.x, fp.position.y, z1);
        const top = project(fp.position.x, fp.position.y, zTop);
        // 底座圆柱
        ctx.fillStyle = '#3A3A40';
        fillEllipse(ctx, bot.x, bot.y, rad * 0.75, ry * 0.70);
        // 发光体圆柱
        const lid = item.libId.toUpperCase();
        let ledCol = '#E03030';
        let ledLit = '#FF6060';
        if (lid.indexOf('GREEN') >= 0 || lid.indexOf('LED_G') >= 0) {
            ledCol = '#20A040';
            ledLit = '#50E080';
        }
        else if (lid.indexOf('BLUE') >= 0 || lid.indexOf('LED_B') >= 0) {
            ledCol = '#2040C0';
            ledLit = '#5080F0';
        }
        ctx.fillStyle = ledCol;
        fillEllipse(ctx, mid.x, mid.y, rad, ry);
        // 柱侧连接（底→腰）
        ctx.strokeStyle = ledCol;
        ctx.lineWidth = Math.max(2, rad * 0.55);
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(bot.x, bot.y);
        ctx.lineTo(mid.x, mid.y);
        ctx.stroke();
        // 半球顶 + 漫射光晕
        ctx.fillStyle = hexAlpha(ledLit, 0.22);
        fillEllipse(ctx, top.x, top.y, rad * 1.55, ry * 1.45);
        ctx.fillStyle = ledLit;
        fillEllipse(ctx, top.x, top.y, rad, ry);
        ctx.fillStyle = 'rgba(255,255,255,0.40)';
        fillEllipse(ctx, top.x - rad * 0.22, top.y - ry * 0.22, rad * 0.38, ry * 0.22);
        // 引脚
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            const bp = project(w.x, w.y, z0);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(bp.x, bp.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** 二极管：轴向玻璃体 + 色环 */
    private static drawDiode(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const zMid = item.zBase + item.bodyH * 0.5;
        const mid = project(fp.position.x, fp.position.y, zMid);
        const r = Math.max(5, 8 * Math.min(zoom, 1.3));
        const ry = r * 0.55;
        // 玻璃体
        ctx.fillStyle = '#E0A040';
        fillEllipse(ctx, mid.x, mid.y, r, ry);
        ctx.fillStyle = 'rgba(255,200,120,0.45)';
        fillEllipse(ctx, mid.x, mid.y, r * 0.85, ry * 0.82);
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        fillEllipse(ctx, mid.x - r * 0.1, mid.y - ry * 0.1, r * 0.45, ry * 0.25);
        // 阴极黑环
        ctx.fillStyle = '#101010';
        fillEllipse(ctx, mid.x - r * 0.3, mid.y, r * 0.10, ry);
        // 引脚
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            const w = localRot(pad.pos.x, pad.pos.y, fp);
            const sign = pad.pos.x > 0 ? 1 : -1;
            const bp = project(w.x - sign * r * 0.5, w.y, zMid);
            const ep = project(w.x, w.y, item.zBase + 1.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(bp.x, bp.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** BJT 三极管：TO-92 半圆柱体 */
    private static drawBjt(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        const r = Math.max(8, 12 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = rad * 0.60;
        const bot = project(fp.position.x, fp.position.y, z0);
        const top = project(fp.position.x, fp.position.y, z1);
        // 半圆柱体（黑色塑封）
        ctx.fillStyle = '#1A1A20';
        fillEllipse(ctx, bot.x, bot.y, rad, ry);
        ctx.fillStyle = '#222228';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        ctx.fillStyle = 'rgba(60,60,68,0.35)';
        fillEllipse(ctx, top.x - rad * 0.2, top.y - ry * 0.2, rad * 0.5, ry * 0.25);
        // 三引脚
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bot.x + (w.x - fp.position.x) * zoom * 0.5, bot.y + (w.y - fp.position.y) * zoom * 0.5);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** MOSFET: TO-220 相似但更小 */
    private static drawMosfet(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        drawExtrudedBox(ctx, project, fp, -22, -16, 22, 16, z0, z1, '#1A1A22', '#121218', '#3A3A42');
        // 金属背板
        drawExtrudedBox(ctx, project, fp, -20, -18, 20, -12, z1 - 1, z1 + item.bodyH * 0.25, '#C0C4C8', '#909498', '#D8DCE0');
        // 引脚
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const bp = project(w.x * 0.4 + fp.position.x * 0.6, w.y * 0.4 + fp.position.y * 0.6, z0);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(bp.x, bp.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** 电位器：圆柱 + 调节轴 */
    private static drawPot(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number, flatY: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        const r = Math.max(10, 14 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = Math.max(3, rad * Math.min(0.88, flatY + 0.06));
        const bot = project(fp.position.x, fp.position.y, z0);
        const top = project(fp.position.x, fp.position.y, z1);
        // 电位器本体（蓝色/灰色圆柱）
        ctx.fillStyle = '#3A4A6A';
        fillEllipse(ctx, bot.x, bot.y, rad, ry);
        ctx.fillStyle = '#4A5A8A';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        // 调节轴
        const shaftRad = rad * 0.3;
        const shaftRy = ry * 0.28;
        const shaftTopZ = z1 + 8;
        const shaftTop = project(fp.position.x, fp.position.y, shaftTopZ);
        ctx.fillStyle = '#D0D0D8';
        fillEllipse(ctx, shaftTop.x, shaftTop.y, shaftRad, shaftRy);
        ctx.fillStyle = Mat3d.PIN_HI;
        fillEllipse(ctx, shaftTop.x, shaftTop.y, shaftRad * 0.7, shaftRy * 0.65);
    }
    /** 晶振：矩形金属壳 + 圆角 */
    private static drawXtal(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        // 金属外壳
        drawExtrudedBox(ctx, project, fp, -18, -10, 18, 10, z0, z1, '#D0D4D8', '#A0A4A8', '#E8ECF0');
        // 顶面圆角标记
        fillBoardQuad(ctx, project, fp, -14, -7, 14, 7, z1 + 0.12, 'rgba(255,255,255,0.25)');
        // 频率标记点
        const d = localRot(-12, 0, fp);
        const dp = project(d.x, d.y, z1 + 0.2);
        ctx.fillStyle = '#404050';
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    /** 轻触开关：方形基座 + 圆形按钮 */
    private static drawSwitch(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const zBase = z0 + 4;
        const zBtn = z0 + item.bodyH;
        const r = Math.max(7, 10 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = rad * 0.55;
        const mid = project(fp.position.x, fp.position.y, zBase);
        const top = project(fp.position.x, fp.position.y, zBtn);
        // 基座
        drawExtrudedBox(ctx, project, fp, -12, -12, 12, 12, z0, zBase, '#2A2A32', '#1A1A22', '#3A3A42');
        // 按钮
        ctx.fillStyle = '#3A3A44';
        fillEllipse(ctx, mid.x, mid.y, rad, ry);
        ctx.fillStyle = '#4A4A58';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        fillEllipse(ctx, top.x - rad * 0.15, top.y - ry * 0.15, rad * 0.45, ry * 0.25);
        // 引脚
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(mid.x + (w.x - fp.position.x) * zoom * 0.4, mid.y + (w.y - fp.position.y) * zoom * 0.4);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** 继电器：矩形 + 引脚 */
    private static drawRelay(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        // 蓝色/透明外壳
        drawExtrudedBox(ctx, project, fp, -24, -16, 24, 16, z0, z1, '#3060B0', '#204080', '#5080D0');
        // 顶面标记
        fillBoardQuad(ctx, project, fp, -12, -8, 12, 8, z1 + 0.15, 'rgba(255,255,255,0.15)');
        // 品牌标记区
        fillBoardQuad(ctx, project, fp, -8, -2, 8, 2, z1 + 0.18, 'rgba(255,255,255,0.25)');
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            const bp = project(w.x, w.y, z0);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(bp.x, bp.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** 蜂鸣器：圆柱 + 顶面音孔 */
    private static drawBuzzer(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        const r = Math.max(10, 15 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = rad * 0.58;
        const bot = project(fp.position.x, fp.position.y, z0);
        const top = project(fp.position.x, fp.position.y, z1);
        ctx.fillStyle = '#202028';
        fillEllipse(ctx, bot.x, bot.y, rad, ry);
        ctx.fillStyle = '#303038';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        // 顶面音孔
        ctx.fillStyle = '#101018';
        ctx.beginPath();
        ctx.arc(top.x, top.y, rad * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#404048';
        ctx.lineWidth = 1;
        ctx.stroke();
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        fillEllipse(ctx, top.x - rad * 0.25, top.y - ry * 0.2, rad * 0.3, ry * 0.18);
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(bot.x + (w.x - fp.position.x) * zoom * 0.4, bot.y + (w.y - fp.position.y) * zoom * 0.4);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** LCD1602：长方形显示屏 */
    private static drawLcd(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        // PCB 底板（绿色）
        drawExtrudedBox(ctx, project, fp, -40, -18, 40, 18, z0, z0 + 8, '#0B6A30', '#085020', '#0D8A3A');
        // LCD 面板（深灰）
        drawExtrudedBox(ctx, project, fp, -36, -14, 36, 14, z0 + 8, z1, '#282830', '#1A1A20', '#3A3A44');
        // 显示区域
        fillBoardQuad(ctx, project, fp, -30, -8, 30, 8, z1 + 0.12, '#1A2A10');
        // 字符行
        fillBoardQuad(ctx, project, fp, -26, -4, 26, 4, z1 + 0.15, 'rgba(100,180,80,0.25)');
        // 排针
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const bp = project(w.x, w.y, z0 + 6);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(bp.x, bp.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** OLED：薄型显示模块 */
    private static drawOled(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        drawExtrudedBox(ctx, project, fp, -20, -12, 20, 12, z0, z1, '#181820', '#101018', '#282830');
        // 屏幕区域
        fillBoardQuad(ctx, project, fp, -16, -8, 16, 8, z1 + 0.1, '#0A0A10');
        // 蓝色发光
        fillBoardQuad(ctx, project, fp, -14, -6, 14, 6, z1 + 0.12, 'rgba(40,80,200,0.18)');
    }
    /** TO-92 传感器：类似 BJT 但有颜色标识 */
    private static drawSensorTo92(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        const r = Math.max(8, 11 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = rad * 0.55;
        const bot = project(fp.position.x, fp.position.y, z0);
        const top = project(fp.position.x, fp.position.y, z1);
        const mid = project(fp.position.x, fp.position.y, (z0 + z1) / 2);
        // 传感器本体（灰色圆柱 + 蓝色环）
        ctx.fillStyle = '#2A2A30';
        fillEllipse(ctx, bot.x, bot.y, rad, ry);
        ctx.fillStyle = '#353540';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        // 蓝色标识环
        ctx.fillStyle = '#2040A0';
        fillEllipse(ctx, mid.x, mid.y, rad * 0.92, ry * 0.88);
        ctx.fillStyle = 'rgba(100,140,255,0.3)';
        fillEllipse(ctx, top.x - rad * 0.15, top.y - ry * 0.15, rad * 0.4, ry * 0.2);
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bot.x + (w.x - fp.position.x) * zoom * 0.5, bot.y + (w.y - fp.position.y) * zoom * 0.5);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** SIP 传感器：长方形 + 引脚 */
    private static drawSensorSip(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        drawExtrudedBox(ctx, project, fp, -12, -8, 12, 8, z0, z1, '#1A1A22', '#12121A', '#2A2A35');
        fillBoardQuad(ctx, project, fp, -8, -4, 8, 4, z1 + 0.12, 'rgba(255,255,255,0.1)');
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const bp = project(w.x, w.y, z0);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(bp.x, bp.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** 光敏电阻：圆形顶面 + 蛇形图案 */
    private static drawLdr(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        const r = Math.max(8, 10 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = rad * 0.55;
        const bot = project(fp.position.x, fp.position.y, z0);
        const top = project(fp.position.x, fp.position.y, z1);
        // 基座
        ctx.fillStyle = '#3A3028';
        fillEllipse(ctx, bot.x, bot.y, rad, ry);
        // 感光面
        ctx.fillStyle = '#C8B898';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        // 蛇形图案（锯齿线）
        ctx.strokeStyle = '#8A7060';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2;
            const x0 = top.x + Math.cos(ang) * rad * 0.3;
            const y0 = top.y + Math.sin(ang) * ry * 0.3;
            const x1 = top.x + Math.cos(ang + Math.PI / 6) * rad * 0.65;
            const y1 = top.y + Math.sin(ang + Math.PI / 6) * ry * 0.55;
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
        }
        ctx.stroke();
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        fillEllipse(ctx, top.x - rad * 0.2, top.y - ry * 0.15, rad * 0.35, ry * 0.2);
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bot.x + (w.x - fp.position.x) * zoom * 0.4, bot.y + (w.y - fp.position.y) * zoom * 0.4);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** 仪器探针：灰色圆柱 + BNC/探头形状 */
    private static drawInstrument(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        const r = Math.max(8, 12 * Math.min(zoom, 1.3));
        const rad = r * zoom;
        const ry = rad * 0.58;
        const bot = project(fp.position.x, fp.position.y, z0);
        const top = project(fp.position.x, fp.position.y, z1);
        // 探头体（灰色圆柱 + 红环）
        ctx.fillStyle = '#585860';
        fillEllipse(ctx, bot.x, bot.y, rad, ry);
        ctx.fillStyle = '#686870';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        // 红色标识环
        const midZ = (z0 + z1) / 2;
        const midP = project(fp.position.x, fp.position.y, midZ);
        ctx.fillStyle = '#D03030';
        fillEllipse(ctx, midP.x, midP.y, rad * 0.85, ry * 0.82);
        // 金属尖端
        const tipZ = z1 + 4;
        const tip = project(fp.position.x, fp.position.y, tipZ);
        ctx.fillStyle = Mat3d.PIN_HI;
        fillEllipse(ctx, tip.x, tip.y, rad * 0.3, ry * 0.25);
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const w = localRot(fp.pads[pi].pos.x, fp.pads[pi].pos.y, fp);
            const ep = project(w.x, w.y, item.zBase + 0.5);
            ctx.strokeStyle = '#666670';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(bot.x + (w.x - fp.position.x) * zoom * 0.5, bot.y + (w.y - fp.position.y) * zoom * 0.5);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
        }
    }
    /** 电源/信号端子：灰色小方块 + 标识点 */
    private static drawTerminal(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw): void {
        const hw = item.hw;
        const hh = item.hh;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        drawExtrudedBox(ctx, project, item.fp, -hw, -hh, hw, hh, z0, z1, '#404048', '#303038', '#505058');
        // 端子顶面标识（小圆点）
        const d = localRot(0, 0, item.fp);
        const dp = project(d.x, d.y, z1 + 0.15);
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, Math.max(2, hw * 0.15), 0, Math.PI * 2);
        ctx.fillStyle = '#707078';
        ctx.fill();
    }
    /** 电解电容：高质量圆柱渲染 + 极性带 + 防爆阀 */
    private static drawElecCap(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number, flatY: number): void {
        const fp = item.fp;
        const r = Math.max(10, Math.min(item.hw, item.hh) * 0.90);
        const rad = r * zoom;
        const z0 = item.zBase + 0.8;
        const z1 = item.zBase + item.bodyH;
        const bot = project(fp.position.x, fp.position.y, z0);
        const top = project(fp.position.x, fp.position.y, z1);
        const ry = Math.max(2.5, rad * Math.min(0.92, flatY + 0.08));
        const dx = top.x - bot.x;
        const dy = top.y - bot.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = (-dy / len) * rad;
        const ny = (dx / len) * rad;
        // 柱体四层着色：暗 → 中间暗 → 主亮 → 高光
        // 暗侧
        ctx.fillStyle = '#141E3A';
        ctx.beginPath();
        ctx.moveTo(bot.x + nx, bot.y + ny);
        ctx.lineTo(top.x + nx, top.y + ny);
        ctx.lineTo(top.x + nx * 0.3, top.y + ny * 0.3);
        ctx.lineTo(bot.x + nx * 0.3, bot.y + ny * 0.3);
        ctx.closePath();
        ctx.fill();
        // 中间调
        ctx.fillStyle = '#18285A';
        ctx.beginPath();
        ctx.moveTo(bot.x + nx * 0.3, bot.y + ny * 0.3);
        ctx.lineTo(top.x + nx * 0.3, top.y + ny * 0.3);
        ctx.lineTo(top.x, top.y);
        ctx.lineTo(bot.x, bot.y);
        ctx.closePath();
        ctx.fill();
        // 亮侧
        ctx.fillStyle = '#1C3A88';
        ctx.beginPath();
        ctx.moveTo(bot.x, bot.y);
        ctx.lineTo(top.x, top.y);
        ctx.lineTo(top.x - nx * 0.7, top.y - ny * 0.7);
        ctx.lineTo(bot.x - nx * 0.7, bot.y - ny * 0.7);
        ctx.closePath();
        ctx.fill();
        // 高光带
        const hlNx = nx * 0.30;
        const hlNy = ny * 0.30;
        ctx.fillStyle = 'rgba(100,155,240,0.28)';
        ctx.beginPath();
        ctx.moveTo(bot.x + hlNx + nx * 0.08, bot.y + hlNy + ny * 0.08);
        ctx.lineTo(top.x + hlNx + nx * 0.08, top.y + hlNy + ny * 0.08);
        ctx.lineTo(top.x + hlNx - nx * 0.08, top.y + hlNy - ny * 0.08);
        ctx.lineTo(bot.x + hlNx - nx * 0.08, bot.y + hlNy - ny * 0.08);
        ctx.closePath();
        ctx.fill();
        // 负极标识带（灰色竖条）
        const stripeNx = nx * 0.55;
        const stripeNy = ny * 0.55;
        ctx.fillStyle = 'rgba(180,185,195,0.55)';
        ctx.beginPath();
        ctx.moveTo(bot.x + stripeNx + nx * 0.04, bot.y + stripeNy + ny * 0.04);
        ctx.lineTo(top.x + stripeNx + nx * 0.04, top.y + stripeNy + ny * 0.04);
        ctx.lineTo(top.x + stripeNx - nx * 0.04, top.y + stripeNy - ny * 0.04);
        ctx.lineTo(bot.x + stripeNx - nx * 0.04, bot.y + stripeNy - ny * 0.04);
        ctx.closePath();
        ctx.fill();
        // 负号标记
        const negX = bot.x + stripeNx;
        const negY = bot.y + stripeNy;
        const negMidZ = (z0 + z1) / 2;
        const negMid = project(fp.position.x + (fp.position.x - negX) * 0.05 + r * 0.35 * (ny / (Math.abs(ny) + 0.01)), fp.position.y + r * 0.35 * (-nx / (Math.abs(nx) + 0.01)), negMidZ);
        ctx.fillStyle = '#888890';
        ctx.font = `bold ${Math.max(7, 10 * Math.min(zoom, 1.3))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('−', negMid.x, negMid.y);
        // 底面胶塞
        ctx.fillStyle = '#202028';
        fillEllipse(ctx, bot.x, bot.y, rad, ry);
        ctx.fillStyle = '#282830';
        fillEllipse(ctx, bot.x, bot.y, rad * 0.82, ry * 0.80);
        // 顶面铝壳
        ctx.fillStyle = '#A8B0B8';
        fillEllipse(ctx, top.x, top.y, rad, ry);
        ctx.fillStyle = '#C8D0D8';
        fillEllipse(ctx, top.x, top.y, rad * 0.88, ry * 0.86);
        // 防爆阀（K 形刻痕）
        const ventR = rad * 0.55;
        const ventRy = ry * 0.50;
        ctx.strokeStyle = 'rgba(100,108,118,0.50)';
        ctx.lineWidth = Math.max(0.8, 1.0 * Math.min(zoom, 1.5));
        ctx.beginPath();
        ctx.arc(top.x, top.y + ventRy * 0.25, ventR * 0.42, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(top.x - ventR * 0.38, top.y + ventRy * 0.08);
        ctx.lineTo(top.x + ventR * 0.38, top.y + ventRy * 0.08);
        ctx.stroke();
        // 顶面高光
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        fillEllipse(ctx, top.x - rad * 0.18, top.y - ry * 0.15, rad * 0.45, ry * 0.22);
    }
    private static drawSilkLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontPx: number): void {
        ctx.font = `bold ${fontPx}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2.2, fontPx * 0.18);
        ctx.strokeStyle = 'rgba(0,40,20,0.55)';
        ctx.lineJoin = 'round';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = Mat3d.SILK;
        ctx.fillText(text, x, y);
    }
    /** 阻焊层渲染：板面填充 + 渐变纹理 + 焊盘开口 */
    private static drawMaskLayer(ctx: CanvasRenderingContext2D, project: ProjectFn, outline: Point2D[], zBase: number, z: number, alpha: number, isTop: boolean): void {
        if (alpha <= 0.03)
            return;
        // 底色填充
        const baseCol = isTop ? Mat3d.MASK_TOP : Mat3d.MASK;
        ctx.fillStyle = hexAlpha(baseCol, alpha);
        ctx.beginPath();
        for (let i = 0; i < outline.length; i++) {
            const pt = project(outline[i].x, outline[i].y, z);
            if (i === 0)
                ctx.moveTo(pt.x, pt.y);
            else
                ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fill();
        // 微渐变叠加 — 模拟光照下的阻焊光泽变化
        if (isTop && alpha > 0.15) {
            const bx = boardBoundsX_simple(outline);
            const oy = boardBoundsY_simple(outline);
            const cx = (bx.x + bx.y) / 2;
            const cy = (oy.x + oy.y) / 2;
            const c = project(cx, cy, z + 0.15);
            const gradR = Math.max(120, (bx.y - bx.x) * 0.48);
            const grad = ctx.createRadialGradient(c.x, c.y, gradR * 0.15, c.x, c.y, gradR);
            grad.addColorStop(0, hexAlpha('#FFFFFF', Math.min(0.06, alpha * 0.10)));
            grad.addColorStop(0.5, 'rgba(0,0,0,0)');
            grad.addColorStop(1, hexAlpha('#000000', Math.min(0.08, alpha * 0.14)));
            ctx.fillStyle = grad;
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x, outline[i].y, z + 0.2);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
        }
    }
    /** 丝印层渲染：板框虚线 + 封装丝印 */
    private static drawSilkLayer(ctx: CanvasRenderingContext2D, project: ProjectFn, doc: PcbDocument, outline: Point2D[], boardH: number, alpha: number, isBottom: boolean): void {
        if (alpha <= 0.03)
            return;
        const z = isBottom ? 1.2 : (boardH + 0.7);
        const col = hexAlpha(Mat3d.SILK, 0.65 * alpha);
        const lib = getGlobalPcbFootprintLibrary();
        // 封装丝印 (元件轮廓线 + pin1标记)
        for (let fi = 0; fi < doc.footprints.length; fi++) {
            const fp = doc.footprints[fi];
            const fpBottom = fp.layer === PcbLayerId.B_CU;
            if (fpBottom !== isBottom)
                continue;
            const def = lib.getDef(fp.defId);
            if (def === null || def.silkLines.length === 0)
                continue;
            ctx.strokeStyle = col;
            ctx.lineWidth = isBottom ? 0.9 : 1.1;
            ctx.setLineDash(isBottom ? [4, 6] : []);
            for (let si = 0; si < def.silkLines.length; si++) {
                const line = def.silkLines[si];
                if (line.length < 2)
                    continue;
                ctx.beginPath();
                const p0 = localRot(line[0].x, line[0].y, fp);
                const s0 = project(p0.x, p0.y, z);
                ctx.moveTo(s0.x, s0.y);
                for (let pi = 1; pi < line.length; pi++) {
                    const pw = localRot(line[pi].x, line[pi].y, fp);
                    const sp = project(pw.x, pw.y, z);
                    ctx.lineTo(sp.x, sp.y);
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }
        // 板框丝印线
        ctx.strokeStyle = hexAlpha(Mat3d.SILK, 0.58 * alpha);
        ctx.lineWidth = 1.2;
        ctx.setLineDash(isBottom ? [6, 12] : [14, 8]);
        ctx.beginPath();
        for (let i = 0; i < outline.length; i++) {
            const pt = project(outline[i].x, outline[i].y, z);
            if (i === 0)
                ctx.moveTo(pt.x, pt.y);
            else
                ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
    }
    /** 钢网层：SMD 焊盘上方浅银焊膏（板面投影四边形，禁止屏幕 fillRect） */
    private static drawPastePass(ctx: CanvasRenderingContext2D, project: ProjectFn, doc: PcbDocument, boardH: number, copperOrder: PcbLayerId[], alpha: number, isBottom: boolean): void {
        if (alpha <= 0.03)
            return;
        const z = isBottom ? 0.7 : (boardH + 0.5);
        const pasteCol = isBottom ? hexAlpha('#A8A8B0', 0.32 * alpha) : hexAlpha('#C8C8D0', 0.30 * alpha);
        const glossCol = hexAlpha('#E8E8F0', 0.10 * alpha);
        for (let fi = 0; fi < doc.footprints.length; fi++) {
            const fp = doc.footprints[fi];
            const fpBottom = fp.layer === PcbLayerId.B_CU;
            if (fpBottom !== isBottom)
                continue;
            for (let pi = 0; pi < fp.pads.length; pi++) {
                const pad = fp.pads[pi];
                if (pad.type !== PcbPadType.SMD)
                    continue;
                const hx = pad.size.x * 0.38;
                const hy = pad.size.y * 0.38;
                fillBoardQuad(ctx, project, fp, pad.pos.x - hx, pad.pos.y - hy, pad.pos.x + hx, pad.pos.y + hy, z, pasteCol);
                const hx2 = hx * 0.55;
                const hy2 = hy * 0.55;
                fillBoardQuad(ctx, project, fp, pad.pos.x - hx2, pad.pos.y - hy2, pad.pos.x + hx2, pad.pos.y + hy2, z + 0.12, glossCol);
            }
        }
    }
    /** Edge Cuts 板框边线：黄色高亮 */
    private static drawEdgeCutsLayer(ctx: CanvasRenderingContext2D, project: ProjectFn, outline: Point2D[], boardH: number, alpha: number): void {
        if (alpha <= 0.03)
            return;
        // 外圈粗线
        ctx.strokeStyle = hexAlpha('#E8A020', 0.75 * alpha);
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < outline.length; i++) {
            const pt = project(outline[i].x, outline[i].y, boardH + 1.5);
            if (i === 0)
                ctx.moveTo(pt.x, pt.y);
            else
                ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.stroke();
        // 内圈细亮线
        ctx.strokeStyle = hexAlpha('#FFD060', 0.45 * alpha);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 转角标记圆点
        ctx.fillStyle = hexAlpha('#FFD060', 0.55 * alpha);
        for (let i = 0; i < outline.length; i++) {
            const pt = project(outline[i].x, outline[i].y, boardH + 1.8);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    /** Courtyard 元件边界：灰色半透明虚线矩形 */
    private static drawCourtyardLayer(ctx: CanvasRenderingContext2D, project: ProjectFn, doc: PcbDocument, boardH: number, alpha: number): void {
        if (alpha <= 0.03)
            return;
        const lib = getGlobalPcbFootprintLibrary();
        const z = boardH + 1.0;
        ctx.strokeStyle = hexAlpha('#A0A0B0', 0.32 * alpha);
        ctx.lineWidth = 1.0;
        ctx.setLineDash([6, 10]);
        for (let fi = 0; fi < doc.footprints.length; fi++) {
            const fp = doc.footprints[fi];
            if (fp.layer === PcbLayerId.B_CU)
                continue;
            const def = lib.getDef(fp.defId);
            if (def === null)
                continue;
            if (def.courtyard.length >= 3) {
                ctx.beginPath();
                for (let ci = 0; ci < def.courtyard.length; ci++) {
                    const cw = localRot(def.courtyard[ci].x, def.courtyard[ci].y, fp);
                    const cp = project(cw.x, cw.y, z);
                    if (ci === 0)
                        ctx.moveTo(cp.x, cp.y);
                    else
                        ctx.lineTo(cp.x, cp.y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);
    }
    /** 坐标网格：深色背景上细线 + 坐标轴 */
    private static drawFloor(ctx: CanvasRenderingContext2D, project: ProjectFn, cx: number, cy: number, doc: PcbDocument): void {
        const bb = boardBoundsX(doc);
        const by = boardBoundsY(doc);
        const halfW = Math.max(260, (bb.y - bb.x) * 0.6);
        const halfH = Math.max(260, (by.y - by.x) * 0.6);
        const step = 200;
        const margin = 200;
        const x0 = cx - halfW - margin;
        const x1 = cx + halfW + margin;
        const y0 = cy - halfH - margin;
        const y1 = cy + halfH + margin;
        // 细网格线
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 0.8;
        const fineStep = step / 2;
        for (let x = Math.floor(x0 / fineStep) * fineStep; x <= x1; x += fineStep) {
            const a = project(x, y0, -8);
            const b = project(x, y1, -8);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        for (let y = Math.floor(y0 / fineStep) * fineStep; y <= y1; y += fineStep) {
            const a = project(x0, y, -8);
            const b = project(x1, y, -8);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        // 粗网格线
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        ctx.lineWidth = 1.2;
        for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
            const a = project(x, y0, -8);
            const b = project(x, y1, -8);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
            const a = project(x0, y, -8);
            const b = project(x1, y, -8);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        // 坐标轴（板左下角外侧）
        const ox = bb.x - 110;
        const oy = by.x - 110;
        const o = project(ox, oy, -6);
        const ax = project(ox + 320, oy, -6);
        const ay = project(ox, oy + 320, -6);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(ax.x, ax.y);
        ctx.stroke();
        ctx.fillStyle = '#E74C3C';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('X', ax.x + 5, ax.y);
        ctx.strokeStyle = '#27AE60';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(ay.x, ay.y);
        ctx.stroke();
        ctx.fillStyle = '#27AE60';
        ctx.fillText('Y', ay.x + 5, ay.y);
    }
}
