import { PcbLayerId, PcbViaKind, PcbStackLayerType, copperLayersFromStack, isCopperLayer } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbFootprintInst, Point2D, PcbLayerStack } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface Pcb3dHit {
    kind: 'footprint' | 'track' | 'via';
    id: string;
    distPx: number;
}
export interface Pcb3dInterference {
    aId: string;
    bId: string;
    aRef: string;
    bRef: string;
    overlapMil: number;
}
export interface Pcb3dProjectCtx {
    boardCx: number;
    boardCy: number;
    yaw: number;
    pitch: number;
    zoom: number;
    ox: number;
    oy: number;
    ortho: boolean;
    boardH: number;
    explode: boolean;
    explodeGap: number;
    cutX: number | null;
    xray: boolean;
}
export function milToMm(mil: number): number {
    return mil * 0.0254;
}
/** 正交近似：屏幕坐标反投影到板面 (wz=boardH) */
export function unprojectBoardOrtho(sx: number, sy: number, boardCx: number, boardCy: number, yaw: number, pitch: number, zoom: number, ox: number, oy: number, boardH: number): Point2D {
    const cyaw = Math.cos(yaw);
    const syaw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const sx0 = (sx - ox) / Math.max(zoom, 0.01);
    const sy0 = (sy - oy) / Math.max(zoom, 0.01);
    const y1 = Math.abs(cp) > 0.08 ? (sy0 + boardH * sp) / cp : sy0;
    const x1 = sx0;
    const x0 = x1 * cyaw + y1 * syaw;
    const y0 = -x1 * syaw + y1 * cyaw;
    return { x: boardCx + x0, y: boardCy + y0 };
}
export function dist3(a: Point2D, b: Point2D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}
/** 板体厚度 mm（铜 + 介质，不含阻焊） */
export function boardBodyThicknessMm(stack: PcbLayerStack | undefined): number {
    if (!stack || !stack.layers)
        return 0;
    let mm = 0;
    for (let i = 0; i < stack.layers.length; i++) {
        const sl = stack.layers[i];
        if (sl.type === PcbStackLayerType.SOLDERMASK)
            continue;
        if (sl.thicknessMm > 0)
            mm += sl.thicknessMm;
    }
    return mm;
}
/**
 * 3D 板厚（世界单位）：由层叠铜层数 / 物理厚度决定，不再跟 zoom 挂钩。
 * 2L≈56、4L≈72、6L≈96、8L≈120；若 stack 有 mm 厚度则优先换算。
 */
export function boardThicknessWorld(doc: PcbDocument): number {
    const stack = doc.layerStack;
    const fromStack = stack ? copperLayersFromStack(stack) : [];
    const n = Math.max(2, stack?.copperCount ?? (fromStack.length > 0 ? fromStack.length : 2));
    const byCount = n <= 2 ? 56 : (n <= 4 ? 72 : (n <= 6 ? 96 : 120));
    const mm = boardBodyThicknessMm(stack);
    if (mm >= 0.4) {
        // 历史标尺：1.6mm ≈ 56 世界单位
        const fromMm = mm * (56 / 1.6);
        return Math.max(40, Math.min(160, fromMm));
    }
    return byCount;
}
/**
 * 按 layerStack 各层 thicknessMm 自底向上累加，返回铜箔中心归一化高度 0=底 1=顶。
 * stack 层序约定为顶→底（F.Mask … B.Mask）。失败返回 -1。
 */
function copperPhysicalNormZ(layer: PcbLayerId, stack: PcbLayerStack): number {
    const total = boardBodyThicknessMm(stack);
    if (total < 1e-6)
        return -1;
    let acc = 0;
    for (let i = stack.layers.length - 1; i >= 0; i--) {
        const sl = stack.layers[i];
        if (sl.type === PcbStackLayerType.SOLDERMASK)
            continue;
        const t = sl.thicknessMm > 0 ? sl.thicknessMm : 0;
        if (sl.type === PcbStackLayerType.COPPER && sl.copperLayerId === layer) {
            const mid = (acc + t * 0.5) / total;
            // 底铜略抬离 z=0，顶铜贴齐板面，避免与底板/阻焊 z-fighting
            if (mid < 0.02)
                return 0.06;
            if (mid > 0.98)
                return 1.0;
            return mid;
        }
        acc += t;
    }
    return -1;
}
/** 是否为板底侧铜层（用于先画底层、提高可见性） */
export function isBottomSideCopper(layer: PcbLayerId, copperOrder: PcbLayerId[], stack?: PcbLayerStack): boolean {
    return copperLayerNormZ(layer, copperOrder, stack) < 0.45;
}
/**
 * 铜层在板厚方向的归一化高度 0=底 1=顶。
 * 优先按 layerStack 各层 thicknessMm 累加；无有效厚度时回退为铜层顺序均分。
 */
export function copperLayerNormZ(layer: PcbLayerId, copperOrder: PcbLayerId[], stack?: PcbLayerStack): number {
    if (stack !== undefined && stack.layers !== undefined && stack.layers.length > 0) {
        const phys = copperPhysicalNormZ(layer, stack);
        if (phys >= 0)
            return phys;
    }
    const idx = copperOrder.indexOf(layer);
    if (idx >= 0) {
        const n = Math.max(copperOrder.length - 1, 1);
        const t = 1.0 - idx / n;
        if (t <= 0.001)
            return 0.06;
        if (t >= 0.999)
            return 1.0;
        return t;
    }
    if (layer === PcbLayerId.B_CU)
        return 0.06;
    if (layer === PcbLayerId.F_CU)
        return 1.0;
    return 0.5;
}
export function copperWorldZ(layer: PcbLayerId, boardH: number, copperOrder: PcbLayerId[], explode: boolean, explodeGap: number, stack?: PcbLayerStack): number {
    const t = copperLayerNormZ(layer, copperOrder, stack);
    let z = t * boardH;
    if (explode) {
        const idx = copperOrder.indexOf(layer);
        const i = idx >= 0 ? idx : 0;
        z = (copperOrder.length - 1 - i) * explodeGap + t * 8;
    }
    return z;
}
export function viaZSpan(viaLayers: PcbLayerId[], kind: PcbViaKind | undefined, boardH: number, copperOrder: PcbLayerId[], explode: boolean, explodeGap: number, stack?: PcbLayerStack): Point2D {
    let zBot = 0;
    let zTop = boardH;
    if (viaLayers.length >= 2) {
        let minN = 1;
        let maxN = 0;
        for (let i = 0; i < viaLayers.length; i++) {
            const n = copperLayerNormZ(viaLayers[i], copperOrder, stack);
            minN = Math.min(minN, n);
            maxN = Math.max(maxN, n);
        }
        zBot = minN * boardH;
        zTop = maxN * boardH;
        if (explode) {
            zBot = copperWorldZ(viaLayers[viaLayers.length - 1], boardH, copperOrder, true, explodeGap, stack);
            zTop = copperWorldZ(viaLayers[0], boardH, copperOrder, true, explodeGap, stack);
            if (zBot > zTop) {
                const t = zBot;
                zBot = zTop;
                zTop = t;
            }
        }
    }
    else if (kind === PcbViaKind.BLIND) {
        zBot = boardH * 0.45;
        zTop = boardH;
    }
    else if (kind === PcbViaKind.BURIED) {
        zBot = boardH * 0.28;
        zTop = boardH * 0.72;
    }
    return { x: zBot, y: zTop };
}
export function buildProjectFn(ctx: Pcb3dProjectCtx): (wx: number, wy: number, wz: number) => Point2D {
    const cyaw = Math.cos(ctx.yaw);
    const syaw = Math.sin(ctx.yaw);
    const cp = Math.cos(ctx.pitch);
    const sp = Math.sin(ctx.pitch);
    const perspK = ctx.ortho ? 0 : 0.00008;
    return (wx: number, wy: number, wz: number): Point2D => {
        const x0 = wx - ctx.boardCx;
        const y0 = wy - ctx.boardCy;
        const x1 = x0 * cyaw - y0 * syaw;
        const y1 = x0 * syaw + y0 * cyaw;
        const y2 = y1 * cp - wz * sp;
        let sx = x1 * ctx.zoom;
        let sy = y2 * ctx.zoom;
        if (!ctx.ortho) {
            const depth = y1 * sp + wz * cp;
            const scale = 1 / (1 + depth * perspK);
            sx *= scale;
            sy *= scale;
        }
        return { x: ctx.ox + sx, y: ctx.oy + sy };
    };
}
export function boardCenter(doc: PcbDocument): Point2D {
    const outline = doc.boardOutline.points;
    if (outline.length === 0)
        return { x: 0, y: 0 };
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < outline.length; i++) {
        cx += outline[i].x;
        cy += outline[i].y;
    }
    return { x: cx / outline.length, y: cy / outline.length };
}
export function boardBoundsX(doc: PcbDocument): Point2D {
    const outline = doc.boardOutline.points;
    if (outline.length === 0)
        return { x: 0, y: 0 };
    let minX = outline[0].x;
    let maxX = outline[0].x;
    for (let i = 1; i < outline.length; i++) {
        minX = Math.min(minX, outline[i].x);
        maxX = Math.max(maxX, outline[i].x);
    }
    return { x: minX, y: maxX };
}
/** 屏幕点拾取最近 3D 对象（投影距离） */
export function hitTest3d(doc: PcbDocument, project: (wx: number, wy: number, wz: number) => Point2D, boardH: number, sx: number, sy: number, maxDistPx: number = 28): Pcb3dHit | null {
    let best: Pcb3dHit | null = null;
    const consider = (kind: 'footprint' | 'track' | 'via', id: string, px: number, py: number): void => {
        const d = Math.sqrt((px - sx) * (px - sx) + (py - sy) * (py - sy));
        if (d > maxDistPx)
            return;
        if (best === null || d < best.distPx) {
            best = { kind, id, distPx: d };
        }
    };
    for (let i = 0; i < doc.footprints.length; i++) {
        const fp = doc.footprints[i];
        const z = fp.layer === PcbLayerId.B_CU ? 4 : boardH + 12;
        const p = project(fp.position.x, fp.position.y, z);
        consider('footprint', fp.id, p.x, p.y);
    }
    for (let i = 0; i < doc.vias.length; i++) {
        const v = doc.vias[i];
        const p = project(v.position.x, v.position.y, boardH * 0.5);
        consider('via', v.id, p.x, p.y);
    }
    for (let i = 0; i < doc.tracks.length; i++) {
        const t = doc.tracks[i];
        const mx = (t.start.x + t.end.x) / 2;
        const my = (t.start.y + t.end.y) / 2;
        const z = t.layer === PcbLayerId.F_CU ? boardH + 2 : boardH * 0.15;
        const p = project(mx, my, z);
        consider('track', t.id, p.x, p.y);
    }
    return best;
}
function fpHalfExtents(fp: PcbFootprintInst): Point2D {
    let hw = 30;
    let hh = 20;
    for (let i = 0; i < fp.pads.length; i++) {
        const p = fp.pads[i];
        hw = Math.max(hw, Math.abs(p.pos.x) + p.size.x / 2);
        hh = Math.max(hh, Math.abs(p.pos.y) + p.size.y / 2);
    }
    return { x: hw * 0.9, y: hh * 0.9 };
}
/** 简易 XY 包围盒干涉（同侧贴片/插件） */
export function detectInterference(doc: PcbDocument, clearanceMil: number): Pcb3dInterference[] {
    const gap = clearanceMil > 0 ? clearanceMil : 8;
    const out: Pcb3dInterference[] = [];
    const fps = doc.footprints;
    for (let i = 0; i < fps.length; i++) {
        const a = fps[i];
        if (a.refDes.startsWith('H'))
            continue;
        const ae = fpHalfExtents(a);
        for (let j = i + 1; j < fps.length; j++) {
            const b = fps[j];
            if (b.refDes.startsWith('H'))
                continue;
            if (a.layer !== b.layer)
                continue;
            const be = fpHalfExtents(b);
            const dx = Math.abs(a.position.x - b.position.x);
            const dy = Math.abs(a.position.y - b.position.y);
            const overlapX = ae.x + be.x + gap - dx;
            const overlapY = ae.y + be.y + gap - dy;
            if (overlapX > 0 && overlapY > 0) {
                out.push({
                    aId: a.id, bId: b.id, aRef: a.refDes, bRef: b.refDes,
                    overlapMil: Math.min(overlapX, overlapY)
                });
            }
        }
    }
    return out;
}
/** 高度色阶：蓝(低)→红(高) */
export function heightHeatColor(norm: number): string {
    const t = Math.max(0, Math.min(1, norm));
    const r = Math.round(40 + t * 200);
    const g = Math.round(80 + (1 - Math.abs(t - 0.5) * 2) * 100);
    const b = Math.round(200 - t * 160);
    const rr = r.toString(16).padStart(2, '0');
    const gg = g.toString(16).padStart(2, '0');
    const bb = b.toString(16).padStart(2, '0');
    return `#${rr}${gg}${bb}`;
}
/**
 * 简化 STEP AP214：板盒 + 元件盒（供外壳装配粗验证）
 */
export function exportPcbSimpleStep(doc: PcbDocument): string {
    const outline = doc.boardOutline.points;
    let minX = 0;
    let minY = 0;
    let maxX = 1000;
    let maxY = 800;
    if (outline.length > 0) {
        minX = outline[0].x;
        maxX = outline[0].x;
        minY = outline[0].y;
        maxY = outline[0].y;
        for (let i = 1; i < outline.length; i++) {
            minX = Math.min(minX, outline[i].x);
            maxX = Math.max(maxX, outline[i].x);
            minY = Math.min(minY, outline[i].y);
            maxY = Math.max(maxY, outline[i].y);
        }
    }
    // mil → mm
    const x0 = milToMm(minX);
    const y0 = milToMm(minY);
    const x1 = milToMm(maxX);
    const y1 = milToMm(maxY);
    const th = 1.6;
    const lines: string[] = [];
    lines.push('ISO-10303-21;');
    lines.push('HEADER;');
    lines.push(`FILE_DESCRIPTION(('ElecDraw PCB 3D simplified'),'2;1');`);
    lines.push(`FILE_NAME('${doc.name || 'board'}.step','${new Date().toISOString()}',('ElecDraw'),('ElecDraw'),'','ElecDraw Harmony','');`);
    lines.push(`FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`);
    lines.push('ENDSEC;');
    lines.push('DATA;');
    let id = 1;
    const emitBox = (name: string, bx0: number, by0: number, bz0: number, bx1: number, by1: number, bz1: number): void => {
        lines.push(`/* ${name} bbox mm: (${bx0.toFixed(3)},${by0.toFixed(3)},${bz0.toFixed(3)})-(${bx1.toFixed(3)},${by1.toFixed(3)},${bz1.toFixed(3)}) */`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx0.toFixed(4)},${by0.toFixed(4)},${bz0.toFixed(4)}));`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx1.toFixed(4)},${by0.toFixed(4)},${bz0.toFixed(4)}));`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx1.toFixed(4)},${by1.toFixed(4)},${bz0.toFixed(4)}));`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx0.toFixed(4)},${by1.toFixed(4)},${bz0.toFixed(4)}));`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx0.toFixed(4)},${by0.toFixed(4)},${bz1.toFixed(4)}));`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx1.toFixed(4)},${by0.toFixed(4)},${bz1.toFixed(4)}));`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx1.toFixed(4)},${by1.toFixed(4)},${bz1.toFixed(4)}));`);
        lines.push(`#${id++}=CARTESIAN_POINT('',(${bx0.toFixed(4)},${by1.toFixed(4)},${bz1.toFixed(4)}));`);
    };
    emitBox('BOARD', x0, y0, 0, x1, y1, th);
    for (let i = 0; i < doc.footprints.length; i++) {
        const fp = doc.footprints[i];
        const e = fpHalfExtents(fp);
        const cx = milToMm(fp.position.x);
        const cy = milToMm(fp.position.y);
        const hx = milToMm(e.x);
        const hy = milToMm(e.y);
        const hNum: number = fp.refDes.startsWith('J') ? 8.0 : (fp.refDes.startsWith('U') ? 2.0 : 1.0);
        const z0 = fp.layer === PcbLayerId.B_CU ? (0 - hNum) : th;
        const z1 = fp.layer === PcbLayerId.B_CU ? 0 : th + hNum;
        emitBox(fp.refDes, cx - hx, cy - hy, z0, cx + hx, cy + hy, z1);
    }
    lines.push('ENDSEC;');
    lines.push('END-ISO-10303-21;');
    return lines.join('\n');
}
export function isCutAway(wx: number, cutX: number | null): boolean {
    if (cutX === null)
        return false;
    return wx > cutX;
}
export function copperOrderOf(doc: PcbDocument): PcbLayerId[] {
    const fromStack = copperLayersFromStack(doc.layerStack);
    if (fromStack.length > 0)
        return fromStack;
    const fallback: PcbLayerId[] = [];
    for (let i = 0; i < doc.layers.length; i++) {
        if (isCopperLayer(doc.layers[i].id))
            fallback.push(doc.layers[i].id);
    }
    return fallback.length > 0 ? fallback : [PcbLayerId.F_CU, PcbLayerId.B_CU];
}
