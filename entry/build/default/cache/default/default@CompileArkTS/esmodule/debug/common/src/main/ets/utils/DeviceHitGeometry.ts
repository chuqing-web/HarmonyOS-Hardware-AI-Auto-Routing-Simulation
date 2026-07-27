import type { Pin, Point2D } from '../types/CommonTypes';
import type { DeviceInst, RouteLine } from '../types/TopologyTypes';
import { calcSymbolBounds, coverOriginCenteredBody } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/SymbolGeometry";
import type { SymbolBounds } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/SymbolGeometry";
import { WireConflictGeometry } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/WireConflictGeometry";
/** 与 SchematicEditorImpl.HIT_PAD 保持一致 — 点击/悬停选中外扩 */
export const SELECTION_HIT_PAD = 22;
/**
 * 布线障碍外扩（须明显小于 SELECTION_HIT_PAD）。
 * 选中区可偏大方便点选，但障碍过大时会把引脚深埋，WAR/正交布线无法落到脚上。
 */
export const WIRE_OBSTACLE_PAD = 6;
/** 导线距无关引脚的最小安全距离 (mil) */
export const FOREIGN_PIN_CLEARANCE = 20;
/** 智能标号：避让导线/已有标号/旗标文字框 */
export interface LabelPlaceHints {
    /** 既有导线折线（含它网长线；本网短 stub 可省略） */
    wirePaths?: Point2D[][];
    /** 已放置标号锚点 */
    occupiedLabels?: Point2D[];
    /** 标号文本（估旗标框宽） */
    labelText?: string;
    /** 导线净空（默认 8） */
    wireClearance?: number;
    /** 标号互斥净空（默认 18） */
    labelClearance?: number;
}
export interface WorldHitRect {
    x: number;
    y: number;
    w: number;
    h: number;
    refName: string;
    instUuid: string;
    libDevId: string;
}
export interface WirePathCoverage {
    netUuid: string;
    pointCount: number;
    points: Point2D[];
    segmentCount: number;
    lengthMil: number;
    bbox: WorldHitRect;
}
export class DeviceHitGeometry {
    static expandLocal(bounds: SymbolBounds, pad: number): SymbolBounds {
        return {
            minX: bounds.minX - pad,
            maxX: bounds.maxX + pad,
            minY: bounds.minY - pad,
            maxY: bounds.maxY + pad,
            width: bounds.width + pad * 2,
            height: bounds.height + pad * 2
        };
    }
    /**
     * pad 外扩后，把「原本贴齐引脚」的边收回，使引脚埋入深度 ≤ maxBuried。
     * 解决 HIT_PAD/障碍 pad 均匀外扩把脚深埋 → 点选选错器件、WAR 无法沿走廊逃逸。
     */
    static exposePinsInLocalBounds(padded: SymbolBounds, original: SymbolBounds, pinLocals: Point2D[], maxBuried: number): SymbolBounds {
        if (pinLocals.length === 0) {
            return padded;
        }
        const bury = Math.max(0, maxBuried);
        const edgeTol = 14;
        let minX = padded.minX;
        let maxX = padded.maxX;
        let minY = padded.minY;
        let maxY = padded.maxY;
        for (let i = 0; i < pinLocals.length; i++) {
            const p = pinLocals[i];
            if (p.x <= original.minX + edgeTol) {
                minX = Math.max(minX, p.x - bury);
            }
            if (p.x >= original.maxX - edgeTol) {
                maxX = Math.min(maxX, p.x + bury);
            }
            if (p.y <= original.minY + edgeTol) {
                minY = Math.max(minY, p.y - bury);
            }
            if (p.y >= original.maxY - edgeTol) {
                maxY = Math.min(maxY, p.y + bury);
            }
        }
        if (maxX - minX < 8) {
            const cx = (padded.minX + padded.maxX) / 2;
            minX = cx - 4;
            maxX = cx + 4;
        }
        if (maxY - minY < 8) {
            const cy = (padded.minY + padded.maxY) / 2;
            minY = cy - 4;
            maxY = cy + 4;
        }
        return {
            minX: minX,
            maxX: maxX,
            minY: minY,
            maxY: maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
    /** pad 外扩 + 引脚露边（选中区 / 布线障碍共用） */
    static expandLocalExposingPins(bounds: SymbolBounds, pinLocals: Point2D[], pad: number, maxBuried: number): SymbolBounds {
        const padded = DeviceHitGeometry.expandLocal(bounds, pad);
        return DeviceHitGeometry.exposePinsInLocalBounds(padded, bounds, pinLocals, maxBuried);
    }
    static transformLocal(local: Point2D, rotate: number, mirrorH: boolean): Point2D {
        let lx = local.x;
        let ly = local.y;
        if (mirrorH) {
            lx = -lx;
        }
        const rot = ((rotate % 360) + 360) % 360;
        if (rot === 90) {
            return { x: -ly, y: lx };
        }
        if (rot === 180) {
            return { x: -lx, y: -ly };
        }
        if (rot === 270) {
            return { x: ly, y: -lx };
        }
        return { x: lx, y: ly };
    }
    /** 局部 SymbolBounds → 世界 AABB（含旋转镜像） */
    static localToWorldAabb(ox: number, oy: number, rotate: number, mirrorH: boolean, bounds: SymbolBounds, refName: string = '', instUuid: string = '', libDevId: string = ''): WorldHitRect {
        const corners: Point2D[] = [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
            { x: bounds.minX, y: bounds.maxY }
        ];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < corners.length; i++) {
            const t = DeviceHitGeometry.transformLocal(corners[i], rotate, mirrorH);
            const wx = ox + t.x;
            const wy = oy + t.y;
            if (wx < minX) {
                minX = wx;
            }
            if (wy < minY) {
                minY = wy;
            }
            if (wx > maxX) {
                maxX = wx;
            }
            if (wy > maxY) {
                maxY = wy;
            }
        }
        return {
            x: minX, y: minY, w: maxX - minX, h: maxY - minY,
            refName, instUuid, libDevId
        };
    }
    /** 由库引脚计算选中命中区（与编辑器选中范围一致） */
    static hitRectFromPins(pins: Pin[], ox: number, oy: number, rotate: number, mirrorH: boolean, pad: number = SELECTION_HIT_PAD, refName: string = '', instUuid: string = '', libDevId: string = ''): WorldHitRect {
        const raw = calcSymbolBounds(pins, 8);
        const pinLocals: Point2D[] = [];
        for (let i = 0; i < pins.length; i++) {
            pinLocals.push({ x: pins[i].position.x, y: pins[i].position.y });
        }
        // 选中区允许脚略埋（方便点主体），但勿被 pad 深埋
        const maxBuried = pad >= SELECTION_HIT_PAD ? 8 : 2;
        const local = DeviceHitGeometry.expandLocalExposingPins(raw, pinLocals, pad, maxBuried);
        return DeviceHitGeometry.localToWorldAabb(ox, oy, rotate, mirrorH, local, refName, instUuid, libDevId);
    }
    /** 由局部引脚坐标点估算（无完整 Pin[] 时） */
    static hitRectFromLocalPoints(locals: Point2D[], ox: number, oy: number, rotate: number, mirrorH: boolean, pad: number = SELECTION_HIT_PAD, refName: string = '', instUuid: string = '', libDevId: string = ''): WorldHitRect {
        if (locals.length === 0) {
            const fallback: SymbolBounds = {
                minX: -40 - pad, maxX: 40 + pad, minY: -30 - pad, maxY: 30 + pad,
                width: 80 + pad * 2, height: 60 + pad * 2
            };
            return DeviceHitGeometry.localToWorldAabb(ox, oy, rotate, mirrorH, fallback, refName, instUuid, libDevId);
        }
        let minX = locals[0].x;
        let maxX = locals[0].x;
        let minY = locals[0].y;
        let maxY = locals[0].y;
        for (let i = 1; i < locals.length; i++) {
            minX = Math.min(minX, locals[i].x);
            maxX = Math.max(maxX, locals[i].x);
            minY = Math.min(minY, locals[i].y);
            maxY = Math.max(maxY, locals[i].y);
        }
        // 与 calcSymbolBounds 一致：单侧引脚须覆盖原点符号主体
        const covered = coverOriginCenteredBody(minX, maxX, minY, maxY);
        const raw: SymbolBounds = {
            minX: covered.minX - 8,
            maxX: covered.maxX + 8,
            minY: covered.minY - 8,
            maxY: covered.maxY + 8,
            width: covered.width + 16,
            height: covered.height + 16
        };
        const maxBuried = pad >= SELECTION_HIT_PAD ? 8 : 2;
        const local = DeviceHitGeometry.expandLocalExposingPins(raw, locals, pad, maxBuried);
        return DeviceHitGeometry.localToWorldAabb(ox, oy, rotate, mirrorH, local, refName, instUuid, libDevId);
    }
    static hitRectFromDeviceInst(dev: DeviceInst, pins: Pin[], pad: number = SELECTION_HIT_PAD): WorldHitRect {
        return DeviceHitGeometry.hitRectFromPins(pins, dev.x, dev.y, dev.rotate, dev.mirrorH, pad, dev.refName, dev.instUuid, dev.libDevId);
    }
    static pointInRect(px: number, py: number, r: WorldHitRect): boolean {
        return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    }
    /** 引脚到选中区四边距离最短的逃逸方向 */
    static nearestEscapeEdge(pinX: number, pinY: number, r: WorldHitRect): string {
        const distL = pinX - r.x;
        const distR = (r.x + r.w) - pinX;
        const distT = pinY - r.y;
        const distB = (r.y + r.h) - pinY;
        const min = Math.min(distL, distR, distT, distB);
        if (min === distL) {
            return 'L';
        }
        if (min === distR) {
            return 'R';
        }
        if (min === distT) {
            return 'T';
        }
        return 'B';
    }
    /** 标号 stub 终点：沿最近边垂直引出到区外 stubPad */
    static stubLabelOutsidePin(pin: Point2D, r: WorldHitRect, stubPad: number = 20): Point2D {
        const edge = DeviceHitGeometry.nearestEscapeEdge(pin.x, pin.y, r);
        return DeviceHitGeometry.stubLabelOnEdge(pin, r, edge, stubPad);
    }
    static stubLabelOnEdge(pin: Point2D, r: WorldHitRect, edge: string, stubPad: number): Point2D {
        if (edge === 'L') {
            return { x: r.x - stubPad, y: pin.y };
        }
        if (edge === 'R') {
            return { x: r.x + r.w + stubPad, y: pin.y };
        }
        if (edge === 'T') {
            return { x: pin.x, y: r.y - stubPad };
        }
        return { x: pin.x, y: r.y + r.h + stubPad };
    }
    /**
     * 信号标号旗标框（与 SchematicCanvas.drawSignalNetLabel 对齐）。
     * expandLeft=true：锚点左侧展开（导线从右侧接入时，避免旗标压住连接线）。
     * 略放大估宽，避免文字实际比估算更宽时压线。
     */
    static estimateSignalLabelFlagRect(anchor: Point2D, text: string, expandLeft: boolean = false): WorldHitRect {
        const t = (text ?? '').length > 0 ? text : 'NET';
        const fontPx = 12;
        const tw = Math.max(t.length * 7.2, 14);
        const padX = 5;
        const stubLen = 6;
        const boxH = fontPx + 6;
        const boxW = tw + padX * 2 + 4;
        return {
            x: expandLeft ? (anchor.x - stubLen - boxW) : (anchor.x + stubLen),
            y: anchor.y - boxH / 2,
            w: boxW,
            h: boxH,
            refName: '',
            instUuid: '',
            libDevId: ''
        };
    }
    /**
     * 根据接入导线方向推断旗标朝向：导线在锚点右侧 → 旗标向左展开。
     */
    static inferSignalLabelExpandLeft(anchor: Point2D, wirePaths: Point2D[][]): boolean {
        const NEAR = 14;
        let bestD = NEAR;
        let expandLeft = false;
        for (let wi = 0; wi < wirePaths.length; wi++) {
            const path = wirePaths[wi];
            if (!path || path.length < 2) {
                continue;
            }
            const ends: number[] = [0, path.length - 1];
            for (let ei = 0; ei < ends.length; ei++) {
                const idx = ends[ei];
                const ep = path[idx];
                const d = Math.hypot(ep.x - anchor.x, ep.y - anchor.y);
                if (d > bestD) {
                    continue;
                }
                const adj = idx === 0 ? path[1] : path[path.length - 2];
                bestD = d;
                // 邻点在锚点右方：导线从右侧接入
                expandLeft = adj.x > anchor.x + 2;
            }
            // 标号落在导线中段：哪侧延伸更长，旗标朝另一侧
            for (let si = 1; si < path.length; si++) {
                const wa = path[si - 1];
                const wb = path[si];
                if (DeviceHitGeometry.pointSegmentDistance(anchor, wa, wb) > 8) {
                    continue;
                }
                const rightExt = Math.max(wa.x, wb.x) - anchor.x;
                const leftExt = anchor.x - Math.min(wa.x, wb.x);
                if (rightExt > leftExt + 2) {
                    expandLeft = true;
                }
                else if (leftExt > rightExt + 2) {
                    expandLeft = false;
                }
            }
        }
        return expandLeft;
    }
    /** 矩形与线段最小距离（端点在框内视为 0） */
    private static rectSegmentMinDist(r: WorldHitRect, a: Point2D, b: Point2D): number {
        if (DeviceHitGeometry.pointInRect(a.x, a.y, r) ||
            DeviceHitGeometry.pointInRect(b.x, b.y, r) ||
            DeviceHitGeometry.segmentIntersectsRect(a, b, r)) {
            return 0;
        }
        const corners: Point2D[] = [
            { x: r.x, y: r.y },
            { x: r.x + r.w, y: r.y },
            { x: r.x + r.w, y: r.y + r.h },
            { x: r.x, y: r.y + r.h }
        ];
        let minD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < corners.length; i++) {
            const d = DeviceHitGeometry.pointSegmentDistance(corners[i], a, b);
            if (d < minD) {
                minD = d;
            }
        }
        const samples: Point2D[] = [
            a, b,
            { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            { x: (a.x * 3 + b.x) / 4, y: (a.y * 3 + b.y) / 4 },
            { x: (a.x + b.x * 3) / 4, y: (a.y + b.y * 3) / 4 }
        ];
        for (let i = 0; i < samples.length; i++) {
            const p = samples[i];
            const dx = p.x < r.x ? r.x - p.x : (p.x > r.x + r.w ? p.x - (r.x + r.w) : 0);
            const dy = p.y < r.y ? r.y - p.y : (p.y > r.y + r.h ? p.y - (r.y + r.h) : 0);
            const d = Math.hypot(dx, dy);
            if (d < minD) {
                minD = d;
            }
        }
        return minD;
    }
    private static rectsOverlap(a: WorldHitRect, b: WorldHitRect, pad: number = 0): boolean {
        return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
            a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
    }
    /** stub 折线（正交 1～2 段）是否侵入器件体（本脚逃逸走廊放行） */
    private static stubHitsDeviceBody(pin: Point2D, mid: Point2D | null, label: Point2D, own: WorldHitRect, foreign: WorldHitRect[]): boolean {
        const segs: Point2D[][] = mid !== null
            ? [[pin, mid], [mid, label]]
            : [[pin, label]];
        for (let s = 0; s < segs.length; s++) {
            const a = segs[s][0];
            const b = segs[s][1];
            // 本器件：禁止穿体；走廊内允许
            if (DeviceHitGeometry.segmentIntersectsRect(a, b, own)) {
                const samples = DeviceHitGeometry.sampleSegment(a, b, 6);
                for (let i = 0; i < samples.length; i++) {
                    const p = samples[i];
                    if (!DeviceHitGeometry.pointInRect(p.x, p.y, own)) {
                        continue;
                    }
                    if (!DeviceHitGeometry.pointInPinEscapeCorridor(p.x, p.y, pin.x, pin.y, own, 14)) {
                        return true;
                    }
                }
            }
            for (let fi = 0; fi < foreign.length; fi++) {
                const fr = foreign[fi];
                if (fr.instUuid === own.instUuid) {
                    continue;
                }
                if (DeviceHitGeometry.segmentIntersectsRect(a, b, fr) ||
                    DeviceHitGeometry.pointInRect(label.x, label.y, fr)) {
                    return true;
                }
            }
        }
        return false;
    }
    /** 旗标/锚点与导线净空；长线共脚不豁免（避免标号叠在引出线上） */
    private static labelHitsWires(pin: Point2D, mid: Point2D | null, label: Point2D, flag: WorldHitRect, wirePaths: Point2D[][], wireClr: number): boolean {
        const stubSegs: Point2D[][] = mid !== null
            ? [[pin, mid], [mid, label]]
            : [[pin, label]];
        // 旗标不得压住自身引出 stub（仅豁免锚点旁极短视觉 stub）
        const ANCHOR_EXEMPT = 8;
        for (let s = 0; s < stubSegs.length; s++) {
            const sa = stubSegs[s][0];
            const sb = stubSegs[s][1];
            if (DeviceHitGeometry.rectSegmentMinDist(flag, sa, sb) < wireClr) {
                const midX = (sa.x + sb.x) / 2;
                const midY = (sa.y + sb.y) / 2;
                const nearAnchor = Math.hypot(sa.x - label.x, sa.y - label.y) <= ANCHOR_EXEMPT &&
                    Math.hypot(sb.x - label.x, sb.y - label.y) <= ANCHOR_EXEMPT;
                const midNearAnchor = Math.hypot(midX - label.x, midY - label.y) <= ANCHOR_EXEMPT;
                if (!nearAnchor && !midNearAnchor) {
                    return true;
                }
            }
        }
        for (let wi = 0; wi < wirePaths.length; wi++) {
            const path = wirePaths[wi];
            if (!path || path.length < 2) {
                continue;
            }
            const pathLen = WireConflictGeometry.pathLength(path);
            const nearPin = Math.hypot(path[0].x - pin.x, path[0].y - pin.y) <= 10 ||
                Math.hypot(path[path.length - 1].x - pin.x, path[path.length - 1].y - pin.y) <= 10;
            const otherIsShortStub = pathLen <= 55 && path.length <= 3;
            // 同脚短 stub：忽略
            if (nearPin && otherIsShortStub) {
                continue;
            }
            for (let si = 1; si < path.length; si++) {
                const wa = path[si - 1];
                const wb = path[si];
                for (let s = 0; s < stubSegs.length; s++) {
                    const conf = WireConflictGeometry.segmentConflict(stubSegs[s][0], stubSegs[s][1], wa, wb);
                    if (conf === 'orthogonal_cross' || conf === 'collinear_overlap') {
                        return true;
                    }
                    // 平行贴近也算压线
                    if (DeviceHitGeometry.pointSegmentDistance(stubSegs[s][0], wa, wb) < wireClr &&
                        Math.hypot(stubSegs[s][0].x - pin.x, stubSegs[s][0].y - pin.y) > 8) {
                        return true;
                    }
                    if (DeviceHitGeometry.pointSegmentDistance(stubSegs[s][1], wa, wb) < wireClr &&
                        Math.hypot(stubSegs[s][1].x - pin.x, stubSegs[s][1].y - pin.y) > 8) {
                        return true;
                    }
                }
                if (DeviceHitGeometry.rectSegmentMinDist(flag, wa, wb) < wireClr) {
                    return true;
                }
                // 锚点本身勿落在导线上
                if (DeviceHitGeometry.pointSegmentDistance(label, wa, wb) < wireClr) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * 选出不穿透器件、不压导线/已有标号的 stub 终点。
     * 从引脚外向扇出搜索（含侧移），禁止穿体到对侧；旗标向右展开一并校验。
     */
    static stubLabelOutsidePinAvoidForeign(pin: Point2D, own: WorldHitRect, foreign: WorldHitRect[], stubPad: number = 20, foreignPins?: Point2D[], hints?: LabelPlaceHints): Point2D {
        const pinClear: Point2D[] = foreignPins !== undefined ? foreignPins : [];
        const wirePaths: Point2D[][] = hints !== undefined && hints.wirePaths !== undefined
            ? hints.wirePaths : [];
        const occupied: Point2D[] = hints !== undefined && hints.occupiedLabels !== undefined
            ? hints.occupiedLabels : [];
        const labelText = hints !== undefined && hints.labelText !== undefined
            ? hints.labelText : '';
        const wireClr = hints !== undefined && hints.wireClearance !== undefined
            ? hints.wireClearance : 14;
        const labelClr = hints !== undefined && hints.labelClearance !== undefined
            ? hints.labelClearance : 22;
        const preferred = DeviceHitGeometry.nearestEscapeEdge(pin.x, pin.y, own);
        // 外向主方向：必须沿逃逸边，禁止穿体到对侧
        const dirs: string[] = [];
        const pushDir = (d: string): void => {
            if (dirs.indexOf(d) < 0) {
                dirs.push(d);
            }
        };
        pushDir(preferred);
        // 侧向次选（仍外向），最后才尝试右侧（旗标友好）但若会导致穿体由 stubHitsDeviceBody 拒绝
        if (preferred === 'L' || preferred === 'R') {
            pushDir('T');
            pushDir('B');
            pushDir(preferred === 'L' ? 'R' : 'L');
        }
        else {
            pushDir('L');
            pushDir('R');
            pushDir(preferred === 'T' ? 'B' : 'T');
        }
        const dists = [
            Math.max(stubPad, 28), 36, 48, 60, 76, 96, 120, 148, 180, 220
        ];
        const laterals = [0, -16, 16, -32, 32, -48, 48, -72, 72, -96, 96];
        let bestClear: Point2D | null = null;
        let bestClearScore = -1e9;
        let bestAny: Point2D | null = null;
        let bestAnyScore = -1e9;
        for (let di = 0; di < dirs.length; di++) {
            const dir = dirs[di];
            for (let dsi = 0; dsi < dists.length; dsi++) {
                const dist = dists[dsi];
                for (let li = 0; li < laterals.length; li++) {
                    const lat = laterals[li];
                    let label: Point2D;
                    // 候选锚点：沿逃逸边外向 + 侧移（落图 stub 为 pin→label 直线，禁止穿体）
                    if (dir === 'L') {
                        label = { x: own.x - dist, y: pin.y + lat };
                    }
                    else if (dir === 'R') {
                        label = { x: own.x + own.w + dist, y: pin.y + lat };
                    }
                    else if (dir === 'T') {
                        label = { x: pin.x + lat, y: own.y - dist };
                    }
                    else {
                        label = { x: pin.x + lat, y: own.y + own.h + dist };
                    }
                    // 导线从右侧接入（左侧逃逸）→ 旗标向左展开，避免盖住连接 stub
                    const expandLeft = dir === 'L' || pin.x > label.x + 4;
                    let flag = DeviceHitGeometry.estimateSignalLabelFlagRect(label, labelText, expandLeft);
                    // 左侧逃逸：整框须仍在器件左侧
                    if (dir === 'L' && flag.x + flag.w > own.x - 4) {
                        label = { x: label.x - ((flag.x + flag.w) - (own.x - 8)), y: label.y };
                        flag = DeviceHitGeometry.estimateSignalLabelFlagRect(label, labelText, true);
                    }
                    // 直线 stub 必须清器件（与 demote 实际画线一致）
                    if (DeviceHitGeometry.stubHitsDeviceBody(pin, null, label, own, foreign)) {
                        continue;
                    }
                    if (DeviceHitGeometry.rectsOverlap(flag, own, 2)) {
                        continue;
                    }
                    let flagOnForeign = false;
                    for (let fi = 0; fi < foreign.length; fi++) {
                        if (foreign[fi].instUuid === own.instUuid) {
                            continue;
                        }
                        if (DeviceHitGeometry.rectsOverlap(flag, foreign[fi], 4)) {
                            flagOnForeign = true;
                            break;
                        }
                    }
                    if (flagOnForeign) {
                        continue;
                    }
                    const pinClearOk = DeviceHitGeometry.segmentClearsForeignPins(pin, label, pinClear, FOREIGN_PIN_CLEARANCE);
                    const hitsWire = DeviceHitGeometry.labelHitsWires(pin, null, label, flag, wirePaths, wireClr);
                    let hitsLabel = false;
                    for (let oi = 0; oi < occupied.length; oi++) {
                        const o = occupied[oi];
                        if (Math.hypot(o.x - label.x, o.y - label.y) < labelClr) {
                            hitsLabel = true;
                            break;
                        }
                        const otherExpand = DeviceHitGeometry.inferSignalLabelExpandLeft(o, wirePaths);
                        const otherFlag = DeviceHitGeometry.estimateSignalLabelFlagRect(o, labelText.length > 0 ? labelText : 'NET', otherExpand);
                        if (DeviceHitGeometry.rectsOverlap(flag, otherFlag, 6)) {
                            hitsLabel = true;
                            break;
                        }
                    }
                    let score = 0;
                    score += preferred === dir ? 40 : 0;
                    score += lat === 0 ? 15 : 0;
                    score -= dist * 0.08;
                    score -= Math.abs(lat) * 0.05;
                    score -= di * 8;
                    if (!pinClearOk) {
                        score -= 80;
                    }
                    if (hitsWire) {
                        score -= 200;
                    }
                    if (hitsLabel) {
                        score -= 120;
                    }
                    if (score > bestAnyScore) {
                        bestAnyScore = score;
                        bestAny = label;
                    }
                    if (pinClearOk && !hitsWire && !hitsLabel) {
                        const clearScore = score + 500;
                        if (clearScore > bestClearScore) {
                            bestClearScore = clearScore;
                            bestClear = label;
                        }
                        if (di === 0 && dist <= 60 && Math.abs(lat) <= 32) {
                            return label;
                        }
                    }
                }
            }
            if (bestClear !== null && di >= 1) {
                return bestClear;
            }
        }
        if (bestClear !== null) {
            return bestClear;
        }
        if (bestAny !== null) {
            return bestAny;
        }
        return DeviceHitGeometry.stubLabelOnEdge(pin, own, preferred, stubPad + 80);
    }
    /** 线段与标号端点到无关脚的最小距离均 ≥ clearance（两端点 ENDPOINT_EXEMPT 内豁免，与门禁一致） */
    static segmentClearsForeignPins(a: Point2D, b: Point2D, foreignPins: Point2D[], clearance: number): boolean {
        const ENDPOINT_EXEMPT = FOREIGN_PIN_CLEARANCE;
        for (let i = 0; i < foreignPins.length; i++) {
            const fp = foreignPins[i];
            if (Math.hypot(fp.x - a.x, fp.y - a.y) <= ENDPOINT_EXEMPT ||
                Math.hypot(fp.x - b.x, fp.y - b.y) <= ENDPOINT_EXEMPT) {
                continue;
            }
            if (DeviceHitGeometry.pointSegmentDistance(fp, a, b) < clearance) {
                return false;
            }
        }
        return true;
    }
    /** 线段到无关脚的最小距离（无无关脚或均在端点豁免内时视为 Infinity） */
    static minDistToForeignPins(a: Point2D, b: Point2D, foreignPins: Point2D[]): number {
        if (foreignPins.length === 0) {
            return Number.POSITIVE_INFINITY;
        }
        const ENDPOINT_EXEMPT = FOREIGN_PIN_CLEARANCE;
        let minD = Number.POSITIVE_INFINITY;
        let any = false;
        for (let i = 0; i < foreignPins.length; i++) {
            const fp = foreignPins[i];
            if (Math.hypot(fp.x - a.x, fp.y - a.y) <= ENDPOINT_EXEMPT ||
                Math.hypot(fp.x - b.x, fp.y - b.y) <= ENDPOINT_EXEMPT) {
                continue;
            }
            any = true;
            const d = DeviceHitGeometry.pointSegmentDistance(fp, a, b);
            if (d < minD) {
                minD = d;
            }
        }
        return any ? minD : Number.POSITIVE_INFINITY;
    }
    /**
     * 引脚逃逸走廊：本器件选中区内，仅允许从引脚沿「到最近边」的正交短廊走到区外。
     * 禁止斜穿/横穿器件体；走廊半宽默认 ≈ 1 grid。
     */
    static pointInPinEscapeCorridor(px: number, py: number, pinX: number, pinY: number, r: WorldHitRect, halfWidth: number = 12): boolean {
        const hw = Math.max(halfWidth, 8);
        // 脚已在区外：仅脚点邻域放行
        if (!DeviceHitGeometry.pointInRect(pinX, pinY, r)) {
            return Math.abs(px - pinX) <= hw && Math.abs(py - pinY) <= hw;
        }
        // 点不在本区且不在走廊外延：不算本脚逃逸（外层再判其他区）
        const edge = DeviceHitGeometry.nearestEscapeEdge(pinX, pinY, r);
        if (edge === 'L') {
            return px >= (r.x - hw) && px <= (pinX + hw) && Math.abs(py - pinY) <= hw;
        }
        if (edge === 'R') {
            return px >= (pinX - hw) && px <= (r.x + r.w + hw) && Math.abs(py - pinY) <= hw;
        }
        if (edge === 'T') {
            return py >= (r.y - hw) && py <= (pinY + hw) && Math.abs(px - pinX) <= hw;
        }
        return py >= (pinY - hw) && py <= (r.y + r.h + hw) && Math.abs(px - pinX) <= hw;
    }
    /** 点是否落在任一引脚相对该选中区的逃逸走廊内 */
    static pointInAnyPinEscapeCorridor(px: number, py: number, pinPositions: Point2D[], r: WorldHitRect, halfWidth: number = 12): boolean {
        for (let i = 0; i < pinPositions.length; i++) {
            const p = pinPositions[i];
            if (DeviceHitGeometry.pointInPinEscapeCorridor(px, py, p.x, p.y, r, halfWidth)) {
                return true;
            }
        }
        return false;
    }
    static segmentIntersectsRect(a: Point2D, b: Point2D, r: WorldHitRect): boolean {
        if (a.x === b.x) {
            const x = a.x;
            if (x < r.x || x > r.x + r.w) {
                return false;
            }
            const yMin = Math.min(a.y, b.y);
            const yMax = Math.max(a.y, b.y);
            return !(yMax < r.y || yMin > r.y + r.h);
        }
        if (a.y === b.y) {
            const y = a.y;
            if (y < r.y || y > r.y + r.h) {
                return false;
            }
            const xMin = Math.min(a.x, b.x);
            const xMax = Math.max(a.x, b.x);
            return !(xMax < r.x || xMin > r.x + r.w);
        }
        // 非正交：采样检测
        const samples = DeviceHitGeometry.sampleSegment(a, b, 10);
        for (let i = 0; i < samples.length; i++) {
            if (DeviceHitGeometry.pointInRect(samples[i].x, samples[i].y, r)) {
                return true;
            }
        }
        return false;
    }
    static pointSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx === 0 && dy === 0) {
            return Math.hypot(p.x - a.x, p.y - a.y);
        }
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }
    static sampleSegment(a: Point2D, b: Point2D, step: number): Point2D[] {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) {
            return [{ x: a.x, y: a.y }];
        }
        const n = Math.max(1, Math.ceil(len / Math.max(1, step)));
        const out: Point2D[] = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
        return out;
    }
    static wireCoverage(wire: RouteLine): WirePathCoverage {
        const pts = wire.points;
        let length = 0;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
            if (i > 0) {
                length += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
            }
        }
        if (pts.length === 0) {
            minX = 0;
            minY = 0;
            maxX = 0;
            maxY = 0;
        }
        return {
            netUuid: wire.netUuid,
            pointCount: pts.length,
            points: pts.slice(),
            segmentCount: Math.max(0, pts.length - 1),
            lengthMil: Math.round(length),
            bbox: {
                x: minX, y: minY, w: maxX - minX, h: maxY - minY,
                refName: '', instUuid: '', libDevId: ''
            }
        };
    }
    static formatHitRect(r: WorldHitRect): string {
        return `${r.refName || r.instUuid}[${r.libDevId}] 选中区AABB=(${Math.round(r.x)},${Math.round(r.y)},` +
            `${Math.round(r.w)}×${Math.round(r.h)})`;
    }
    static formatWireCoverage(c: WirePathCoverage, maxPts: number = 12): string {
        const show = c.points.slice(0, maxPts)
            .map(p => `(${Math.round(p.x)},${Math.round(p.y)})`)
            .join('→');
        const more = c.points.length > maxPts ? `…(+${c.points.length - maxPts})` : '';
        return `net=${c.netUuid} segs=${c.segmentCount} len=${c.lengthMil}mil ` +
            `bbox=(${Math.round(c.bbox.x)},${Math.round(c.bbox.y)},${Math.round(c.bbox.w)}×${Math.round(c.bbox.h)}) ` +
            `path=${show}${more}`;
    }
}
