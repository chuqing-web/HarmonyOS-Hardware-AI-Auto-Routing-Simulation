import { PcbLayerId, PcbPadType, copperLayersFromStack, getGlobalPcbFootprintLibrary, Pcb3dDisplayMode, PcbViaKind, PcbAppearanceMode, isCopperLayer, padWorldPosition, buildTrackPolylines, tracePcb3d } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbFootprintInst, PcbTrack, Point2D, PcbTrackPolyline } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { copperOrderOf, copperWorldZ, viaZSpan, boardBoundsX, isCutAway, detectInterference, heightHeatColor, hitTest3d, milToMm, dist3, boardThicknessWorld, isBottomSideCopper, copperSlabThickness } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
import type { Pcb3dInterference, Pcb3dHit } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
import { Pcb3dMeshBuilder } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dMeshBuilder";
import { Pcb3dPbrRaster } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dPbrRaster";
import { getBoundStepSig } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/PcbStepImporter";
/** 白皮书 §4.1 材质参数（Canvas 近似：baseColor + 高光强度） */
export class Mat3d {
    static readonly MASK = '#0D6B3A';
    static readonly MASK_LIT = '#14904F';
    static readonly MASK_DIM = '#084F2A';
    static readonly FR4_EDGE = '#8B7355';
    static readonly FR4_EDGE_LIT = '#A08A68';
    static readonly FR4_EDGE_DIM = '#6B5740';
    static readonly COPPER = '#B87333';
    static readonly COPPER_LIT = '#D4A04A';
    static readonly COPPER_HI = '#F0D878';
    static readonly ENIG = '#E8C547';
    static readonly HASL = '#C0C0C0';
    static readonly BARREL = '#A05A2C';
    static readonly SILK = '#F5F5F5';
    static readonly PLASTIC = '#1A1A1A';
    static readonly PLASTIC_LIT = '#2E2E32';
    static readonly CERAMIC = '#E6C88A';
    static readonly PIN = '#D0D0D0';
    static readonly PIN_HI = '#F0F0F0';
    static readonly NPTH = '#6B5740';
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
    layerZs: number[];
    layerColors: string[];
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
}
type ProjectFn = (wx: number, wy: number, wz: number) => Point2D;
function isLayerVis(doc: PcbDocument, layer: PcbLayerId): boolean {
    for (let i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === layer)
            return doc.layers[i].visible;
    }
    return true;
}
/** 3D 铜层是否绘制：只看外观模式（全层/单层），不跟 2D 显隐勾选死锁 */
function copperDrawOk(doc: PcbDocument, layer: PcbLayerId, p: Pcb3dViewParams): boolean {
    if (!isCopperLayer(layer))
        return isLayerVis(doc, layer);
    return copperLayerFocusOk(layer, p);
}
function layerOpacity(doc: PcbDocument, layer: PcbLayerId): number {
    for (let i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === layer) {
            const o = doc.layers[i].opacity;
            return o !== undefined && o >= 0 ? Math.max(0.15, Math.min(1, o)) : 1;
        }
    }
    return 1;
}
function fpKind(defId: string, refDes: string, value: string): string {
    if (defId === 'FP_MOUNT' || refDes.startsWith('H'))
        return 'mount';
    if (defId.indexOf('PINHDR') >= 0 || refDes.startsWith('J'))
        return 'header';
    if (defId.indexOf('TO220') >= 0)
        return 'to220';
    if (defId.indexOf('SOIC') >= 0 || defId.indexOf('DIP') >= 0)
        return 'ic';
    if (defId.indexOf('SOT') >= 0)
        return 'sot';
    if (defId.indexOf('THT') >= 0)
        return 'tht';
    const vu = (value ?? '').toUpperCase();
    if (refDes.startsWith('C') && (vu.indexOf('UF') >= 0 || vu.indexOf('µF') >= 0 || defId.indexOf('RADIAL') >= 0)) {
        return 'elec';
    }
    if (refDes.startsWith('C'))
        return 'cap';
    if (refDes.startsWith('R') || refDes.startsWith('F'))
        return 'res';
    return 'smd';
}
function bodyHeight(kind: string, zoom: number, lodFar: boolean): number {
    const z = Math.min(zoom, 1.2);
    const k = lodFar ? 0.72 : 1;
    if (kind === 'mount')
        return 0;
    if (kind === 'header')
        return Math.max(48, 62 * z) * k;
    if (kind === 'ic')
        return Math.max(16, 24 * z) * k;
    if (kind === 'to220')
        return Math.max(28, 40 * z) * k;
    if (kind === 'sot')
        return Math.max(10, 15 * z) * k;
    if (kind === 'tht')
        return Math.max(18, 26 * z) * k;
    if (kind === 'elec')
        return Math.max(36, 52 * z) * k;
    if (kind === 'cap')
        return Math.max(10, 14 * z) * k;
    if (kind === 'res')
        return Math.max(7, 10 * z) * k;
    return Math.max(7, 10 * z) * k;
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
function hexAlpha(hex: string, a: number): string {
    if (hex.length === 7 && hex.startsWith('#')) {
        const aa = Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, '0');
        return `${hex}${aa}`;
    }
    return hex;
}
function layerColor(doc: PcbDocument, layer: PcbLayerId): string {
    for (let i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === layer)
            return doc.layers[i].color;
    }
    // 固定高对比分色：各铜层一眼可辨
    if (layer === PcbLayerId.F_CU)
        return '#FF1744';
    if (layer === PcbLayerId.B_CU)
        return '#00E676';
    if (layer === PcbLayerId.IN1_CU)
        return '#D500F9';
    if (layer === PcbLayerId.IN2_CU)
        return '#FF9100';
    if (layer === PcbLayerId.IN3_CU)
        return '#651FFF';
    if (layer === PcbLayerId.IN4_CU)
        return '#00E5FF';
    return Mat3d.COPPER;
}
/** 该铜层在当前外观模式下是否应绘制连线 */
function copperLayerFocusOk(layer: PcbLayerId, p: Pcb3dViewParams): boolean {
    if (!isCopperLayer(layer))
        return true;
    if (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY) {
        return layer === p.activeLayer;
    }
    return true;
}
/** 非活动层淡化系数（全可见时=1；淡化时仍要能看见底层绿铜） */
function copperLayerDimFactor(layer: PcbLayerId, p: Pcb3dViewParams): number {
    if (p.appearanceMode === PcbAppearanceMode.DIM_INACTIVE &&
        isCopperLayer(layer) && layer !== p.activeLayer) {
        return Math.max(0.4, Math.min(0.55, p.dimAlpha > 0 ? p.dimAlpha + 0.15 : 0.45));
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
function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
    ctx.beginPath();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.max(rx, 0.01), Math.max(ry, 0.01));
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
}
function strokeEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
    ctx.beginPath();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.max(rx, 0.01), Math.max(ry, 0.01));
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.restore();
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
            const bot = isBottomSideCopper(zn.layer, copperOrder);
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
            const z = copperWorldZ(zn.layer, boardH, copperOrder, false, 0);
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
            const bot = isBottomSideCopper(trk.layer, copperOrder);
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
            tracePcb3d('DRAW_LAYER_COLOR', `${ly} color=${col} drawOk=${ok} bottom=${isBottomSideCopper(ly, copperOrder)}`);
        }
        tracePcb3d('DRAW_SUMMARY', `zones F=${drawnTopZone} B=${drawnBotZone} skipZone≈${skipBotZone} ` +
            `trk F=${drawnTopTrk} B=${drawnBotTrk} skipTrk=${skipTrk} vias=${doc.vias.length}`);
        if (drawnBotZone === 0 && drawnBotTrk === 0) {
            tracePcb3d('DRAW_DIAG', `底层无任何铜被绘制 — 查 ACTIVE_ONLY/hideZones/文档是否缺 B.Cu zone&track`);
        }
    }
    private static docMeshSig(doc: PcbDocument): string {
        let s = `v3d2|${doc.id}|cu${doc.layerStack !== undefined ? doc.layerStack.copperCount : 2}|t${doc.tracks.length}|v${doc.vias.length}|f${doc.footprints.length}|z${doc.zones.length}|o${doc.boardOutline.points.length}|sb${getBoundStepSig()}`;
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
        const mesh = Pcb3dMeshBuilder.build(doc, 28000);
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
        // 工作室背景（略冷，配合环境光）
        const grad = ctx.createLinearGradient(0, 0, 0, p.viewHeight);
        grad.addColorStop(0, '#E8ECF2');
        grad.addColorStop(0.5, '#D0D6E0');
        grad.addColorStop(1, '#A8B0BE');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, p.viewWidth, p.viewHeight);
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
        const flatY = Math.max(0.28, Math.min(0.95, Math.abs(cp) * 0.95 + 0.1));
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
        const ortho = p.ortho;
        const perspK = ortho ? 0 : 0.00022;
        const project: ProjectFn = (wx: number, wy: number, wz: number): Point2D => {
            const x0 = wx - boardCx;
            const y0 = wy - boardCy;
            const x1 = x0 * cyaw - y0 * syaw;
            const y1 = x0 * syaw + y0 * cyaw;
            const y2 = y1 * cp - wz * sp;
            let sx = x1 * zoom;
            let sy = y2 * zoom;
            if (!ortho) {
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
        const showSilk = isLayerVis(doc, PcbLayerId.F_SILKS);
        const xray = mode === Pcb3dDisplayMode.XRAY;
        const explode = mode === Pcb3dDisplayMode.EXPLODE;
        const cutaway = mode === Pcb3dDisplayMode.CUTAWAY;
        const heightmap = mode === Pcb3dDisplayMode.HEIGHTMAP;
        const copperOrder = copperOrderOf(doc);
        // 全层透视：除高度图外，层间拉开间距，侧面可数层、看过孔跨层
        const stackXray = !heightmap;
        const stackPitch = explode
            ? Math.max(40, boardH * 0.78)
            : (stackXray ? Math.max(26, boardH * 0.52) : 0);
        const spreadLayers = stackPitch > 0;
        const explodeGap = stackPitch;
        const stackH = spreadLayers
            ? Math.max(boardH, copperOrder.length * stackPitch)
            : boardH;
        const cuH = copperSlabThickness(boardH, copperOrder, stackPitch, lodFar);
        let cutX: number | null = null;
        if (cutaway) {
            const bx = boardBoundsX(doc);
            const frac = Math.max(0.05, Math.min(0.95, p.cutFraction > 0 ? p.cutFraction : 0.55));
            cutX = bx.x + (bx.y - bx.x) * frac;
        }
        const activeIsBottom = isCopperLayer(p.activeLayer) && isBottomSideCopper(p.activeLayer, copperOrder);
        const focusBottom = activeIsBottom && p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY;
        const boostBottom = activeIsBottom &&
            (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY ||
                p.appearanceMode === PcbAppearanceMode.DIM_INACTIVE);
        // 全层透视：板体/阻焊高透，各铜层分色可见
        const maskAlpha = stackXray || xray || boostBottom ? 0.1 : (explode ? 0.28 : 0.22);
        const edgeAlpha = stackXray || xray || boostBottom ? 0.4 : 0.75;
        const boardGhost = stackXray ? 0.1 : (explode ? 0.18 : (xray || boostBottom ? 0.12 : 0.22));
        const boardTopAlpha = focusBottom ? 0.05 : (stackXray ? 0.08 : (boostBottom ? 0.1 : (xray ? 0.12 : 0.16)));
        Pcb3dRenderer.traceDrawDecisions(doc, p, stackH, boardTopAlpha, 'canvas');
        Pcb3dRenderer.drawFloor(ctx, project, boardCx, boardCy, doc);
        if (outline.length >= 3) {
            ctx.fillStyle = 'rgba(20,24,32,0.22)';
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x + 36, outline[i].y + 48, 0);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = hexAlpha('#1A1510', boardGhost);
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
            // 侧面：介质 + 各铜层色带，一眼看出层数
            for (let i = 0; i < outline.length; i++) {
                const a = outline[i];
                const b = outline[(i + 1) % outline.length];
                const mx = (a.x + b.x) / 2;
                if (cutaway && cutX !== null && isCutAway(mx, cutX))
                    continue;
                if (spreadLayers && copperOrder.length > 0) {
                    Pcb3dRenderer.drawStackEdgeBands(ctx, project, a, b, doc, copperOrder, boardH, explodeGap, cuH, edgeAlpha);
                }
                else {
                    const lit = depthOf(mx, (a.y + b.y) / 2, boardH / 2) >
                        depthOf(boardCx, boardCy, boardH / 2);
                    ctx.fillStyle = hexAlpha(lit ? Mat3d.FR4_EDGE_LIT : Mat3d.FR4_EDGE_DIM, edgeAlpha * boardGhost);
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
            }
            // 半透明介质层板（层间 FR4），强化透视
            if (spreadLayers && copperOrder.length >= 2) {
                Pcb3dRenderer.drawDielectricSlabs(ctx, project, outline, copperOrder, boardH, explodeGap, cuH);
            }
            // 各铜层半透明基板（有厚度的层平面）
            if (spreadLayers) {
                Pcb3dRenderer.drawCopperLayerSlabs(ctx, project, outline, doc, p, copperOrder, boardH, explodeGap, cuH);
            }
            // 顶面阻焊（高透）；纯单层看底层时不填阻焊
            if (!focusBottom && !stackXray) {
                ctx.fillStyle = hexAlpha(Mat3d.MASK, boardTopAlpha);
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
                ctx.strokeStyle = hexAlpha(Mat3d.MASK_LIT, Math.min(1, maskAlpha + 0.2));
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            else if (focusBottom) {
                ctx.strokeStyle = hexAlpha('#69F0AE', 0.55);
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < outline.length; i++) {
                    const pt = project(outline[i].x, outline[i].y, copperWorldZ(PcbLayerId.B_CU, boardH, copperOrder, spreadLayers, explodeGap) - cuH * 0.2);
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
            for (let bi = 0; bi < copperOrder.length; bi++) {
                const ly = copperOrder[copperOrder.length - 1 - bi];
                const zMid = copperWorldZ(ly, boardH, copperOrder, spreadLayers, explodeGap);
                const z0 = zMid - cuH * 0.5;
                const z1 = zMid + cuH * 0.5;
                const c00 = project(cutX, y0, z0);
                const c01 = project(cutX, y1, z0);
                const c11 = project(cutX, y1, z1);
                const c10 = project(cutX, y0, z1);
                ctx.fillStyle = hexAlpha(layerColor(doc, ly), 0.9);
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
            const topE = project(cutX, midY, stackH);
            const botE = project(cutX, midY, 0);
            ctx.beginPath();
            ctx.moveTo(topE.x, topE.y);
            ctx.lineTo(botE.x, botE.y);
            ctx.stroke();
        }
        // 全层透视：始终画全部铜层（ACTIVE_ONLY 除外）
        if (!focusBottom) {
            Pcb3dRenderer.drawCopperPass(ctx, project, depthOf, doc, p, boardH, copperOrder, spreadLayers, explodeGap, cutaway, cutX, hasHl, hl, dim, cuH, zoom, lodFar, false);
            Pcb3dRenderer.drawCopperPass(ctx, project, depthOf, doc, p, boardH, copperOrder, spreadLayers, explodeGap, cutaway, cutX, hasHl, hl, dim, cuH, zoom, lodFar, true);
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
            const span = viaZSpan(via.layers, via.kind, boardH, copperOrder, spreadLayers, explodeGap);
            const kind = via.kind !== undefined ? via.kind : PcbViaKind.THROUGH;
            const viaLy = via.layers.length > 0 ? via.layers : copperOrder;
            const layerZs: number[] = [];
            const layerColors: string[] = [];
            for (let li = 0; li < viaLy.length; li++) {
                layerZs.push(copperWorldZ(viaLy[li], boardH, copperOrder, spreadLayers, explodeGap));
                layerColors.push(layerColor(doc, viaLy[li]));
            }
            viaDraws.push({
                x: via.position.x, y: via.position.y,
                outerR: via.diameter / 2,
                drillR: via.drill > 0 ? via.drill / 2 : via.diameter * 0.22,
                plated: true,
                depth: depthOf(via.position.x, via.position.y, (span.x + span.y) / 2),
                netId: via.netId, id: via.id,
                zBot: span.x, zTop: span.y, kind,
                layerZs, layerColors
            });
        }
        viaDraws.sort((a: ViaDraw, b: ViaDraw) => a.depth - b.depth);
        if (!focusBottom) {
            for (let i = 0; i < viaDraws.length; i++) {
                const v = viaDraws[i];
                const faded = hasHl && v.netId !== hl;
                const alpha = faded ? dim : 1;
                Pcb3dRenderer.drawViaBarrel(ctx, project, v.x, v.y, v.zBot, v.zTop, v.outerR, v.drillR, zoom, flatY, v.plated, lodNear, alpha, selVia.has(v.id), v.kind, v.layerZs, v.layerColors);
            }
        }
        // 层标签：全层透视 / 爆炸均显示
        if (spreadLayers) {
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            for (let li = 0; li < copperOrder.length; li++) {
                const layer = copperOrder[li];
                const z = copperWorldZ(layer, boardH, copperOrder, spreadLayers, explodeGap);
                const lp = project(boardCx - 200, boardCy - 240 + li * 40, z);
                ctx.fillStyle = 'rgba(18,22,30,0.78)';
                ctx.fillRect(lp.x - 4, lp.y - 10, 128, 20);
                ctx.fillStyle = layerColor(doc, layer);
                ctx.fillRect(lp.x - 2, lp.y - 6, 10, 12);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(`${layerDisplayName(doc, layer)}  L${li + 1}/${copperOrder.length}`, lp.x + 12, lp.y);
            }
        }
        const lib = getGlobalPcbFootprintLibrary();
        const fpDraws: FpDraw[] = [];
        for (let fi = 0; fi < doc.footprints.length; fi++) {
            const fp = doc.footprints[fi];
            if (cutaway && cutX !== null && isCutAway(fp.position.x, cutX))
                continue;
            const def = lib.getDef(fp.defId);
            const kind = fpKind(fp.defId, fp.refDes, fp.value);
            const bodyH = bodyHeight(kind, zoom, lodFar) * (stackXray ? 0.55 : 1);
            const zTopCu = copperWorldZ(PcbLayerId.F_CU, boardH, copperOrder, spreadLayers, explodeGap);
            const zBotCu = copperWorldZ(PcbLayerId.B_CU, boardH, copperOrder, spreadLayers, explodeGap);
            const zBase = fp.layer === PcbLayerId.B_CU ? zBotCu - cuH : zTopCu + cuH * 0.5;
            let hw = 28;
            let hh = 18;
            if (kind === 'smd' || kind === 'res' || kind === 'cap') {
                hw = 26;
                hh = 14;
            }
            else if (kind === 'elec') {
                hw = 22;
                hh = 22;
            }
            else if (kind === 'to220') {
                hw = 50;
                hh = 36;
            }
            else if (kind === 'header') {
                hw = 20;
                hh = Math.max(36, fp.pads.length * 44 / 2);
            }
            else if (kind === 'ic' || kind === 'sot') {
                hw = 46;
                hh = 36;
            }
            else if (kind === 'mount') {
                hw = 48;
                hh = 48;
            }
            if (def && (kind === 'ic' || kind === 'sot' || kind === 'tht')) {
                for (let pi = 0; pi < def.pads.length; pi++) {
                    const pad = def.pads[pi];
                    hw = Math.max(hw, Math.abs(pad.pos.x) + pad.size.x / 2);
                    hh = Math.max(hh, Math.abs(pad.pos.y) + pad.size.y / 2);
                }
                hw *= 0.82;
                hh *= 0.82;
            }
            fpDraws.push({
                fp, kind, hw, hh, zBase, bodyH,
                selected: selFp.has(fp.id),
                depth: depthOf(fp.position.x, fp.position.y, zBase + bodyH / 2)
            });
        }
        fpDraws.sort((a: FpDraw, b: FpDraw) => a.depth - b.depth);
        // 聚焦底层时元件半透明；全层透视时也略透以免挡铜
        const fpGhost = focusBottom || stackXray;
        const fpAlpha = focusBottom ? 0.28 : (stackXray ? 0.42 : 1);
        for (let i = 0; i < fpDraws.length; i++) {
            const it = fpDraws[i];
            if (it.kind === 'mount' || it.bodyH < 1)
                continue;
            const c = project(it.fp.position.x + 10, it.fp.position.y + 14, it.zBase + 0.3);
            ctx.fillStyle = fpGhost ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.26)';
            fillEllipse(ctx, c.x, c.y, Math.max(5, it.hw * zoom * 0.52), Math.max(3, it.hh * zoom * 0.3 * flatY + it.bodyH * 0.05));
        }
        for (let i = 0; i < fpDraws.length; i++) {
            const it = fpDraws[i];
            if (fpGhost) {
                ctx.globalAlpha = fpAlpha;
            }
            Pcb3dRenderer.drawPads(ctx, project, it, zoom, flatY, stackH, cuH, lodNear);
            Pcb3dRenderer.drawComponent(ctx, project, it, zoom, lodFar, flatY, heightmap, stackH);
            if (fpGhost) {
                ctx.globalAlpha = 1;
            }
            if (it.selected) {
                Pcb3dRenderer.drawSelectionHalo(ctx, project, it);
            }
            if (showSilk && !lodFar && !focusBottom) {
                const lp = project(it.fp.position.x, it.fp.position.y - it.hh - 14, it.zBase + it.bodyH + 2);
                Pcb3dRenderer.drawSilkLabel(ctx, it.fp.refDes, lp.x, lp.y, Math.max(9, Math.min(13, 8 + zoom * 3)));
            }
        }
        // 聚焦底层：铺铜画在半透明元件之上；过孔再盖在铺铜上
        if (focusBottom) {
            Pcb3dRenderer.drawCopperPass(ctx, project, depthOf, doc, p, boardH, copperOrder, spreadLayers, explodeGap, cutaway, cutX, hasHl, hl, dim, cuH, zoom, lodFar, true);
            for (let i = 0; i < viaDraws.length; i++) {
                const v = viaDraws[i];
                const faded = hasHl && v.netId !== hl;
                const alpha = faded ? dim : 1;
                Pcb3dRenderer.drawViaBarrel(ctx, project, v.x, v.y, v.zBot, v.zTop, v.outerR, v.drillR, zoom, flatY, v.plated, lodNear, alpha, selVia.has(v.id), v.kind, v.layerZs, v.layerColors);
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
        const modeTag = ortho ? '正交' : '透视';
        const modeName = displayModeLabel(mode);
        const focusTag = p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY
            ? `仅 ${p.activeLayer}`
            : (p.appearanceMode === PcbAppearanceMode.DIM_INACTIVE ? `淡化非 ${p.activeLayer}` : '全层可见');
        ctx.fillStyle = 'rgba(18,22,30,0.82)';
        ctx.fillRect(8, 8, 520, 62);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`3D · ${modeName} · ${modeTag} · ${layerCount}铜层叠层透视 · ≈${boardMm.toFixed(2)}mm · ${focusTag}`, 16, 24);
        ctx.fillStyle = 'rgba(180,210,255,0.92)';
        ctx.font = '11px sans-serif';
        ctx.fillText(`侧视可数层 · 每层有厚度 · 过孔落点按层分色 · 拖转看侧面`, 16, 42);
        // 铜层分色图例
        let lx = 16;
        const ly = 56;
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
            lx += 13 + label.length * 6.2 + 10;
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
        // 主线程软件光栅：固定低分辨率，避免 THREAD_BLOCK_6S
        const srcW = Math.min(320, Math.max(160, Math.floor(p.viewWidth * 0.28)));
        const srcH = Math.min(220, Math.max(120, Math.floor(p.viewHeight * 0.28)));
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
        ctx.fillStyle = '#A8B0BE';
        ctx.fillRect(0, 0, p.viewWidth, p.viewHeight);
        Pcb3dPbrRaster.blitToCanvas(ctx, rgba, srcW, srcH, 0, 0, p.viewWidth, p.viewHeight);
        ctx.fillStyle = 'rgba(18,22,30,0.85)';
        ctx.fillRect(8, 8, 480, 44);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`3D · Z-Buffer · Lambert · ${srcW}x${srcH} · tris ${mesh.tris.length}`, 16, 24);
        ctx.fillStyle = 'rgba(180,210,255,0.92)';
        ctx.font = '11px sans-serif';
        ctx.fillText(`yaw ${p.yawDeg.toFixed(0)}°  pitch ${p.pitchDeg.toFixed(0)}°  · 写实材质(轻量)`, 16, 42);
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
            if (!p.ortho) {
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
                const bottom = isBottomSideCopper(zn.layer, copperOrder);
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
                const zMid = copperWorldZ(zn.layer, boardH, copperOrder, explode, explodeGap);
                const zOp = layerOpacity(doc, zn.layer) * copperLayerDimFactor(zn.layer, p);
                // 底层铺铜后画于板体之上：必须够亮，否则会被当成“发灰”
                let a = (bottomOnly ? 0.95 : 0.4) * Math.max(0.55, zOp);
                if (bottomOnly) {
                    a = Math.min(0.98, Math.max(0.72, a));
                }
                else if (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY) {
                    a = Math.min(0.92, a + 0.12);
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
            const bottom = isBottomSideCopper(trk.layer, copperOrder);
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
            const zMid = copperWorldZ(poly.layer, boardH, copperOrder, explode, explodeGap);
            polyDraws.push({ poly, depth: depthOf(cx, cy, zMid) });
        }
        polyDraws.sort((a: PolyDraw, b: PolyDraw) => a.depth - b.depth);
        for (let i = 0; i < polyDraws.length; i++) {
            const poly = polyDraws[i].poly;
            const zMid = copperWorldZ(poly.layer, boardH, copperOrder, explode, explodeGap);
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
            if (!faded && p.appearanceMode === PcbAppearanceMode.OVERLAY) {
                alpha = Math.min(1, Math.max(0.85, alpha));
            }
            if (bottomOnly && !faded)
                alpha = Math.min(1, alpha + 0.08);
            const col = layerColor(doc, poly.layer);
            Pcb3dRenderer.drawPolylineExtruded(ctx, project, poly, z0, z1, zoom, lodFar, alpha, selected, col);
        }
    }
    /** 连续折线挤出：整段一次 stroke，拐角 round join，视觉一体 */
    private static drawPolylineExtruded(ctx: CanvasRenderingContext2D, project: ProjectFn, poly: PcbTrackPolyline, z0: number, z1: number, zoom: number, lodFar: boolean, alpha: number, selected: boolean, copperCol: string): void {
        if (poly.points.length < 2)
            return;
        const w = Math.max(2.0, poly.width * zoom * 0.85);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (!lodFar) {
            ctx.strokeStyle = hexAlpha('#6B4420', 0.45 * alpha);
            ctx.lineWidth = w + 1.2;
            ctx.beginPath();
            const s0 = project(poly.points[0].x, poly.points[0].y, z0);
            ctx.moveTo(s0.x, s0.y);
            for (let i = 1; i < poly.points.length; i++) {
                const p = project(poly.points[i].x, poly.points[i].y, z0);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
        ctx.strokeStyle = hexAlpha(copperCol, alpha);
        ctx.lineWidth = w;
        ctx.beginPath();
        const s1 = project(poly.points[0].x, poly.points[0].y, z1);
        ctx.moveTo(s1.x, s1.y);
        for (let i = 1; i < poly.points.length; i++) {
            const p = project(poly.points[i].x, poly.points[i].y, z1);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // 拐点实心圆：直角/T 接无缝
        const r = w * 0.5;
        ctx.fillStyle = hexAlpha(copperCol, alpha);
        for (let i = 0; i < poly.points.length; i++) {
            const c = project(poly.points[i].x, poly.points[i].y, z1);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = hexAlpha(Mat3d.COPPER_HI, 0.28 * alpha);
        ctx.lineWidth = Math.max(1, w * 0.28);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        for (let i = 1; i < poly.points.length; i++) {
            const p = project(poly.points[i].x, poly.points[i].y, z1);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        if (selected) {
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = w + 3;
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            for (let i = 1; i < poly.points.length; i++) {
                const p = project(poly.points[i].x, poly.points[i].y, z1);
                ctx.lineTo(p.x, p.y);
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
    /** 通孔：孔壁沉铜柱 + 各铜层落点环（透视可见跨层连接） */
    private static drawViaBarrel(ctx: CanvasRenderingContext2D, project: ProjectFn, x: number, y: number, zBot: number, zTop: number, outerR: number, drillR: number, zoom: number, flatY: number, plated: boolean, detail: boolean, alpha: number, selected: boolean, kind: PcbViaKind, layerZs: number[] = [], layerColors: string[] = []): void {
        const ro = Math.max(2.2, outerR * zoom);
        const ri = Math.max(1.0, drillR * zoom);
        const ry = ro * flatY;
        const riy = ri * flatY;
        const span = Math.max(1, zTop - zBot);
        let barrelCol = Mat3d.BARREL;
        if (kind === PcbViaKind.BLIND) {
            barrelCol = '#C9A227';
        }
        else if (kind === PcbViaKind.BURIED) {
            barrelCol = '#6A6A72';
        }
        const steps = detail ? Math.max(6, Math.round(span / 10)) : 4;
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const z = zBot + t * span;
            const c = project(x, y, z);
            if (plated) {
                ctx.fillStyle = hexAlpha(barrelCol, alpha * 0.8);
                fillEllipse(ctx, c.x, c.y, ri * 1.2, riy * 1.2);
            }
            else {
                ctx.fillStyle = hexAlpha(Mat3d.NPTH, alpha * 0.9);
                fillEllipse(ctx, c.x, c.y, ri * 1.05, riy * 1.05);
            }
        }
        // 每一铜层落点环：分色，侧视/透视都能看到过孔接到哪一层
        const nRing = Math.max(layerZs.length, 2);
        for (let i = 0; i < nRing; i++) {
            const z = layerZs.length > 0
                ? layerZs[i]
                : (zBot + (i / Math.max(nRing - 1, 1)) * span);
            const col = layerColors.length > i ? layerColors[i]
                : (i === 0 ? '#00E676' : '#FF1744');
            const c = project(x, y, z);
            ctx.fillStyle = hexAlpha(col, 0.92 * alpha);
            fillEllipse(ctx, c.x, c.y, ro * 1.08, ry * 1.08);
            ctx.strokeStyle = hexAlpha(Mat3d.COPPER_HI, 0.75 * alpha);
            ctx.lineWidth = 1.2;
            strokeEllipse(ctx, c.x, c.y, ro * 1.08, ry * 1.08);
            ctx.fillStyle = '#0A0A0A';
            fillEllipse(ctx, c.x, c.y, ri * 0.95, riy * 0.95);
        }
        if (selected) {
            const top = project(x, y, zTop);
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = 2.5;
            strokeEllipse(ctx, top.x, top.y, ro + 3, ry + 2);
        }
    }
    /** 侧面铜层色带 + 介质带：侧视可直接数层 */
    private static drawStackEdgeBands(ctx: CanvasRenderingContext2D, project: ProjectFn, a: Point2D, b: Point2D, doc: PcbDocument, copperOrder: PcbLayerId[], boardH: number, stackPitch: number, cuH: number, edgeAlpha: number): void {
        const n = copperOrder.length;
        // 自下而上画：介质 → 铜 → 介质 → 铜 …
        for (let li = n - 1; li >= 0; li--) {
            const layer = copperOrder[li];
            const zMid = copperWorldZ(layer, boardH, copperOrder, true, stackPitch);
            const z0 = zMid - cuH * 0.5;
            const z1 = zMid + cuH * 0.5;
            // 下层介质（到下一铜层或底板）
            const zDieBot = li < n - 1
                ? copperWorldZ(copperOrder[li + 1], boardH, copperOrder, true, stackPitch) + cuH * 0.5
                : Math.max(0, z0 - stackPitch * 0.35);
            if (z0 > zDieBot + 0.5) {
                ctx.fillStyle = hexAlpha(Mat3d.FR4_EDGE_DIM, 0.35 * edgeAlpha);
                const d0 = project(a.x, a.y, zDieBot);
                const d1 = project(b.x, b.y, zDieBot);
                const d2 = project(b.x, b.y, z0);
                const d3 = project(a.x, a.y, z0);
                ctx.beginPath();
                ctx.moveTo(d0.x, d0.y);
                ctx.lineTo(d1.x, d1.y);
                ctx.lineTo(d2.x, d2.y);
                ctx.lineTo(d3.x, d3.y);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillStyle = hexAlpha(layerColor(doc, layer), 0.88);
            const a0 = project(a.x, a.y, z0);
            const b0 = project(b.x, b.y, z0);
            const b1 = project(b.x, b.y, z1);
            const a1 = project(a.x, a.y, z1);
            ctx.beginPath();
            ctx.moveTo(a0.x, a0.y);
            ctx.lineTo(b0.x, b0.y);
            ctx.lineTo(b1.x, b1.y);
            ctx.lineTo(a1.x, a1.y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = hexAlpha('#FFFFFF', 0.25);
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
    /** 层间半透明介质板 */
    private static drawDielectricSlabs(ctx: CanvasRenderingContext2D, project: ProjectFn, outline: Point2D[], copperOrder: PcbLayerId[], boardH: number, stackPitch: number, cuH: number): void {
        if (outline.length < 3 || copperOrder.length < 2)
            return;
        for (let li = 0; li < copperOrder.length - 1; li++) {
            const zUpper = copperWorldZ(copperOrder[li], boardH, copperOrder, true, stackPitch) - cuH * 0.5;
            const zLower = copperWorldZ(copperOrder[li + 1], boardH, copperOrder, true, stackPitch) + cuH * 0.5;
            const zMid = (zUpper + zLower) * 0.5;
            ctx.fillStyle = hexAlpha('#C8B090', 0.12);
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x, outline[i].y, zMid);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
        }
    }
    /** 各铜层带厚度的半透明层平面 */
    private static drawCopperLayerSlabs(ctx: CanvasRenderingContext2D, project: ProjectFn, outline: Point2D[], doc: PcbDocument, p: Pcb3dViewParams, copperOrder: PcbLayerId[], boardH: number, stackPitch: number, cuH: number): void {
        if (outline.length < 3)
            return;
        // 自下而上
        const order: number[] = [];
        for (let i = 0; i < copperOrder.length; i++)
            order.push(i);
        order.sort((ia: number, ib: number) => {
            const za = copperWorldZ(copperOrder[ia], boardH, copperOrder, true, stackPitch);
            const zb = copperWorldZ(copperOrder[ib], boardH, copperOrder, true, stackPitch);
            return za - zb;
        });
        for (let oi = 0; oi < order.length; oi++) {
            const layer = copperOrder[order[oi]];
            if (p.appearanceMode === PcbAppearanceMode.ACTIVE_ONLY && layer !== p.activeLayer)
                continue;
            const zMid = copperWorldZ(layer, boardH, copperOrder, true, stackPitch);
            const col = layerColor(doc, layer);
            const dimL = copperLayerDimFactor(layer, p);
            const a = 0.16 * dimL;
            // 底面
            ctx.fillStyle = hexAlpha(col, a * 0.7);
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x, outline[i].y, zMid - cuH * 0.5);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
            // 顶面（更亮）
            ctx.fillStyle = hexAlpha(col, a);
            ctx.beginPath();
            for (let i = 0; i < outline.length; i++) {
                const pt = project(outline[i].x, outline[i].y, zMid + cuH * 0.5);
                if (i === 0)
                    ctx.moveTo(pt.x, pt.y);
                else
                    ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = hexAlpha(col, Math.min(0.85, 0.45 + dimL * 0.3));
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
    private static drawPads(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number, flatY: number, boardH: number, cuH: number, detail: boolean): void {
        const fp = item.fp;
        const z = item.zBase + cuH * 0.85;
        for (let pi = 0; pi < fp.pads.length; pi++) {
            const pad = fp.pads[pi];
            if (pad.type === PcbPadType.TH || item.kind === 'mount') {
                const w = localRot(pad.pos.x, pad.pos.y, fp);
                const outer = Math.max(pad.size.x, pad.size.y) / 2;
                const drill = pad.drill !== undefined ? pad.drill / 2 : outer * 0.4;
                const plated = item.kind !== 'mount' && pad.type !== PcbPadType.NPTH;
                // 简易孔壁
                if (detail && plated) {
                    const mid = project(w.x, w.y, boardH * 0.5);
                    const ri = Math.max(1, drill * zoom);
                    ctx.fillStyle = Mat3d.BARREL;
                    fillEllipse(ctx, mid.x, mid.y, ri * 1.1, ri * flatY * 1.1);
                }
                const c = project(w.x, w.y, z);
                const ro = Math.max(2.2, outer * zoom);
                const ri = Math.max(1, drill * zoom);
                ctx.fillStyle = plated ? Mat3d.ENIG : Mat3d.NPTH;
                fillEllipse(ctx, c.x, c.y, ro, ro * flatY);
                ctx.strokeStyle = Mat3d.COPPER_HI;
                ctx.lineWidth = 1;
                strokeEllipse(ctx, c.x, c.y, ro, ro * flatY);
                ctx.fillStyle = plated ? '#0A0A0A' : Mat3d.FR4_EDGE_DIM;
                fillEllipse(ctx, c.x, c.y, ri, ri * flatY);
            }
            else {
                const hx = pad.size.x / 2;
                const hy = pad.size.y / 2;
                // SMD 焊盘微挤出：底 + 顶
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
        if (kind === 'elec') {
            Pcb3dRenderer.drawElecCap(ctx, project, item, zoom, flatY);
            return;
        }
        if (kind === 'smd' || kind === 'res' || kind === 'cap') {
            Pcb3dRenderer.drawSmdChip(ctx, project, item, kind, lodFar);
            return;
        }
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
        const hw = item.hw;
        const hh = item.hh;
        const z0 = item.zBase + 1.2;
        const z1 = item.zBase + item.bodyH;
        drawExtrudedBox(ctx, project, item.fp, -hw, -hh, hw, hh, z0, z1, Mat3d.PLASTIC_LIT, Mat3d.PLASTIC, '#50545C');
        // 散热区
        fillBoardQuad(ctx, project, item.fp, -hw * 0.7, -hh * 0.55, hw * 0.7, hh * 0.15, z1 + 0.3, 'rgba(160,165,175,0.35)');
        const d = localRot(-hw * 0.55, -hh * 0.55, item.fp);
        const dp = project(d.x, d.y, z1 + 0.4);
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, Math.max(1.6, 2.0 * Math.min(zoom, 1.5)), 0, Math.PI * 2);
        ctx.fillStyle = '#080808';
        ctx.fill();
        // IC 引脚（近距）
        if (!lodFar && item.fp.pads.length > 0) {
            for (let i = 0; i < item.fp.pads.length; i++) {
                const pad = item.fp.pads[i];
                if (pad.type === PcbPadType.TH)
                    continue;
                const tip = localRot(pad.pos.x, pad.pos.y, item.fp);
                const root = localRot(pad.pos.x * 0.55, pad.pos.y * 0.55, item.fp);
                const a = project(root.x, root.y, z0 + 2);
                const b = project(tip.x, tip.y, item.zBase + 1.2);
                ctx.strokeStyle = Mat3d.PIN;
                ctx.lineWidth = Math.max(1.4, Math.min(pad.size.x, pad.size.y) * zoom * 0.35);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
    }
    private static drawSmdChip(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, kind: string, lodFar: boolean): void {
        const fp = item.fp;
        let maxX = 18;
        let maxY = 10;
        for (let i = 0; i < fp.pads.length; i++) {
            maxX = Math.max(maxX, Math.abs(fp.pads[i].pos.x));
            maxY = Math.max(maxY, fp.pads[i].size.y / 2);
        }
        const bodyHalfX = Math.max(7, maxX * 0.38);
        const bodyHalfY = Math.max(5, Math.min(maxY * 0.85, 12));
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + Math.max(item.bodyH, kind === 'cap' ? 10 : 7);
        let top = Mat3d.PLASTIC_LIT;
        let side = Mat3d.PLASTIC;
        let edge = '#5A5A60';
        if (kind === 'cap') {
            top = Mat3d.CERAMIC;
            side = '#C4A870';
            edge = '#F0DCA0';
        }
        else if (kind === 'res') {
            top = '#2A2A2E';
            side = '#1A1A1E';
            edge = '#4A4A50';
        }
        drawExtrudedBox(ctx, project, fp, -bodyHalfX, -bodyHalfY, bodyHalfX, bodyHalfY, z0, z1, top, side, edge);
        fillBoardQuad(ctx, project, fp, -bodyHalfX * 0.7, -bodyHalfY * 0.55, bodyHalfX * 0.15, -bodyHalfY * 0.15, z1 + 0.2, 'rgba(255,255,255,0.2)');
        if (kind === 'res' && !lodFar) {
            // 色环近似
            fillBoardQuad(ctx, project, fp, -2, -bodyHalfY * 0.9, 2, bodyHalfY * 0.9, z1 + 0.3, '#F5F5F5');
        }
        const cap = Math.max(5, maxX * 0.26);
        const gap = bodyHalfX;
        fillBoardQuad(ctx, project, fp, -(gap + cap), -bodyHalfY * 0.95, -gap, bodyHalfY * 0.95, z0 + 0.2, Mat3d.PIN, Mat3d.PIN_HI);
        fillBoardQuad(ctx, project, fp, gap, -bodyHalfY * 0.95, gap + cap, bodyHalfY * 0.95, z0 + 0.2, Mat3d.PIN, Mat3d.PIN_HI);
    }
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
        const baseW = 16;
        const pad = 10;
        const z0 = item.zBase + 1.0;
        const baseH = Math.max(8, item.bodyH * 0.18);
        drawExtrudedBox(ctx, project, fp, -baseW, minY - pad, baseW, maxY + pad, z0, z0 + baseH, Mat3d.PLASTIC_LIT, Mat3d.PLASTIC, '#333333');
        const pinTop = z0 + item.bodyH;
        const pw = Math.max(1.8, 2.5 * Math.min(zoom, 1.5));
        for (let i = 0; i < fp.pads.length; i++) {
            const w = localRot(fp.pads[i].pos.x, fp.pads[i].pos.y, fp);
            const b = project(w.x, w.y, z0 + baseH);
            const t = project(w.x, w.y, pinTop);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = pw;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
            ctx.fillStyle = Mat3d.PIN_HI;
            ctx.fillRect(t.x - pw / 2, t.y - pw / 2, pw, pw * 0.7);
        }
    }
    private static drawTo220(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw): void {
        const fp = item.fp;
        const z0 = item.zBase + 1.2;
        const z1 = item.zBase + item.bodyH;
        drawExtrudedBox(ctx, project, fp, -32, -22, 32, 24, z0, z1, Mat3d.PLASTIC_LIT, Mat3d.PLASTIC, '#484850');
        drawExtrudedBox(ctx, project, fp, -28, -38, 28, -20, z1 - 1.5, z1 + item.bodyH * 0.35, '#B8C0C8', '#8A9098', '#D4DAE0');
        for (let i = 0; i < fp.pads.length; i++) {
            const pad = fp.pads[i];
            const w = localRot(pad.pos.x, pad.pos.y, fp);
            const body = localRot(pad.pos.x * 0.15, 18, fp);
            const a = project(body.x, body.y, z0 + 3);
            const b = project(w.x, w.y, item.zBase + 1.0);
            ctx.strokeStyle = Mat3d.PIN;
            ctx.lineWidth = 2.8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
    }
    private static drawAxial(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number): void {
        const mid = project(item.fp.position.x, item.fp.position.y, item.zBase + item.bodyH * 0.5);
        const r = Math.max(4.5, 8 * Math.min(zoom, 1.3));
        ctx.fillStyle = '#4A90C8';
        fillEllipse(ctx, mid.x, mid.y, r * 1.45, r * 0.6);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        fillEllipse(ctx, mid.x - r * 0.22, mid.y - r * 0.1, r * 0.75, r * 0.2);
    }
    /** 电解电容：蓝色圆柱 + 白色色环 + 橡胶底座 */
    private static drawElecCap(ctx: CanvasRenderingContext2D, project: ProjectFn, item: FpDraw, zoom: number, flatY: number): void {
        const fp = item.fp;
        const r = Math.max(8, Math.min(item.hw, item.hh) * 0.88);
        const rad = r * zoom;
        const z0 = item.zBase + 1.0;
        const z1 = item.zBase + item.bodyH;
        const steps = 5;
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const z = z0 + (z1 - z0) * t;
            const c = project(fp.position.x, fp.position.y, z);
            if (t < 0.12) {
                ctx.fillStyle = '#1A1A1A';
            }
            else {
                ctx.fillStyle = '#1E4FA8';
            }
            fillEllipse(ctx, c.x, c.y, rad, rad * flatY);
        }
        const zs = z0 + (z1 - z0) * 0.58;
        const cs = project(fp.position.x, fp.position.y, zs);
        ctx.fillStyle = '#F0F0F0';
        fillEllipse(ctx, cs.x, cs.y, rad * 1.03, rad * 0.24 * flatY);
        const top = project(fp.position.x, fp.position.y, z1);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        fillEllipse(ctx, top.x - rad * 0.18, top.y - rad * 0.12, rad * 0.42, rad * 0.18 * flatY);
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
    /** 坐标轴画在板外，避免被误认为板内走线 */
    private static drawFloor(ctx: CanvasRenderingContext2D, project: ProjectFn, cx: number, cy: number, doc: PcbDocument): void {
        const bb = boardBoundsX(doc);
        const by = boardBoundsY(doc);
        const halfW = Math.max(200, (bb.y - bb.x) * 0.5);
        const halfH = Math.max(200, (by.y - by.x) * 0.5);
        const step = 250;
        const margin = 180;
        const x0 = cx - halfW - margin;
        const x1 = cx + halfW + margin;
        const y0 = cy - halfH - margin;
        const y1 = cy + halfH + margin;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
            const a = project(x, y0, -10);
            const b = project(x, y1, -10);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
            const a = project(x0, y, -10);
            const b = project(x1, y, -10);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        // 轴原点放在板左下角外侧，不穿过板心
        const ox = bb.x - 120;
        const oy = by.x - 120;
        const o = project(ox, oy, -8);
        const ax = project(ox + 380, oy, -8);
        const ay = project(ox, oy + 380, -8);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(ax.x, ax.y);
        ctx.stroke();
        ctx.fillStyle = '#E74C3C';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('X', ax.x + 4, ax.y);
        ctx.strokeStyle = '#27AE60';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(ay.x, ay.y);
        ctx.stroke();
        ctx.fillStyle = '#27AE60';
        ctx.fillText('Y', ay.x + 4, ay.y);
    }
}
