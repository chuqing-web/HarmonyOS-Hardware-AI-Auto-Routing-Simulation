import type { Point2D } from '../types/CommonTypes';
export function polylineLength(pts: Point2D[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return len;
}
/**
 * 在路径最长直线段上插入蛇形弯折，目标增加 extraLen（mil）。
 * amplitude / pitch 控制振幅与节距。
 */
export function addSerpentineMeander(path: Point2D[], extraLen: number, amplitude: number = 20, pitch: number = 30): Point2D[] {
    if (path.length < 2 || extraLen < 2) {
        return path.slice();
    }
    // 找最长段
    let bestI = 0;
    let bestLen = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const L = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
        if (L > bestLen) {
            bestLen = L;
            bestI = i;
        }
    }
    if (bestLen < pitch * 2) {
        return path.slice();
    }
    const a = path[bestI];
    const b = path[bestI + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // 垂直方向
    const px = -uy;
    const py = ux;
    // 每节蛇形额外长度 ≈ 2 * (sqrt((pitch/2)^2 + amp^2) - pitch/2) * 2 ≈ 简化用 2*amp*2/pitch * pitch
    // 一节（去-回）额外长度约: 2 * (hypot(pitch/2, amp) - pitch/2) * 2
    const half = pitch / 2;
    const bump = Math.hypot(half, amplitude) - half;
    const perCycle = bump * 4; // 上下各一次往返
    if (perCycle < 1) {
        return path.slice();
    }
    let cycles = Math.ceil(extraLen / perCycle);
    const maxCycles = Math.max(1, Math.floor((len - pitch) / pitch));
    if (cycles > maxCycles) {
        cycles = maxCycles;
    }
    if (cycles < 1) {
        return path.slice();
    }
    const usedLen = cycles * pitch;
    const startT = (len - usedLen) / 2 / len;
    const out: Point2D[] = [];
    for (let i = 0; i <= bestI; i++) {
        out.push({ x: path[i].x, y: path[i].y });
    }
    // 进入蛇形起点
    const sx = a.x + ux * startT * len;
    const sy = a.y + uy * startT * len;
    if (Math.hypot(sx - out[out.length - 1].x, sy - out[out.length - 1].y) > 0.5) {
        out.push({ x: sx, y: sy });
    }
    for (let c = 0; c < cycles; c++) {
        const t0 = startT + (c * pitch) / len;
        const t1 = startT + ((c + 0.5) * pitch) / len;
        const t2 = startT + ((c + 1) * pitch) / len;
        const sign = (c % 2 === 0) ? 1 : -1;
        const mx = a.x + ux * t1 * len + px * amplitude * sign;
        const my = a.y + uy * t1 * len + py * amplitude * sign;
        const ex = a.x + ux * t2 * len;
        const ey = a.y + uy * t2 * len;
        out.push({ x: mx, y: my });
        out.push({ x: ex, y: ey });
    }
    for (let i = bestI + 1; i < path.length; i++) {
        out.push({ x: path[i].x, y: path[i].y });
    }
    return out;
}
/**
 * 使 shorter 路径补齐到接近 longer 长度（差值 ≤ tol 即停止）。
 * 返回 [pathA', pathB']，其中较短者可能被蛇形加长。
 */
export function matchDiffPairLengths(pathP: Point2D[], pathN: Point2D[], existingLenP: number, existingLenN: number, tolMil: number, gapMil: number): Point2D[][] {
    const lp = existingLenP + polylineLength(pathP);
    const ln = existingLenN + polylineLength(pathN);
    const diff = Math.abs(lp - ln);
    if (diff <= tolMil) {
        return [pathP, pathN];
    }
    const amp = Math.max(12, Math.min(40, gapMil * 0.9));
    const pitch = Math.max(18, amp * 1.4);
    if (lp < ln) {
        return [addSerpentineMeander(pathP, diff, amp, pitch), pathN];
    }
    return [pathP, addSerpentineMeander(pathN, diff, amp, pitch)];
}
