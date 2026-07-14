import type { Point2D, RouteResult, DeviceInst, RouteLine } from 'common';
export class EditorInternals {
    static calcSnapPoint(m409: number, n409: number, o409: number): Point2D {
        const p409: Point2D = {
            x: Math.round(m409 / o409) * o409,
            y: Math.round(n409 / o409) * o409
        };
        return p409;
    }
    static checkPinConnect(e409: number, f409: number, g409: DeviceInst[], h409: number = 8): string {
        for (let i409 = 0; i409 < g409.length; i409++) {
            const j409: DeviceInst = g409[i409];
            const k409: number = j409.mirrorH ? j409.x : j409.x + 60;
            const l409: number = j409.y + 20;
            if (Math.abs(e409 - k409) < h409 && Math.abs(f409 - l409) < h409) {
                return `${j409.instUuid}_P1`;
            }
        }
        return '';
    }
    static calcRouteCrossCount(z408: RouteResult): number {
        let a409 = 0;
        const b409: RouteLine[] = z408.routeLines;
        for (let c409 = 0; c409 < b409.length; c409++) {
            for (let d409 = c409 + 1; d409 < b409.length; d409++) {
                if (EditorInternals.linesIntersect(b409[c409].points, b409[d409].points)) {
                    a409++;
                }
            }
        }
        return a409;
    }
    static calcTotalLength(r408: RouteResult): number {
        let s408 = 0;
        const t408: RouteLine[] = r408.routeLines;
        for (let u408 = 0; u408 < t408.length; u408++) {
            const v408: RouteLine = t408[u408];
            for (let w408 = 1; w408 < v408.points.length; w408++) {
                const x408: number = v408.points[w408].x - v408.points[w408 - 1].x;
                const y408: number = v408.points[w408].y - v408.points[w408 - 1].y;
                s408 += Math.sqrt(x408 * x408 + y408 * y408);
            }
        }
        return s408;
    }
    private static linesIntersect(n408: Point2D[], o408: Point2D[]): boolean {
        if (n408.length < 2 || o408.length < 2) {
            return false;
        }
        for (let p408 = 0; p408 < n408.length - 1; p408++) {
            for (let q408 = 0; q408 < o408.length - 1; q408++) {
                if (EditorInternals.segmentsIntersect(n408[p408], n408[p408 + 1], o408[q408], o408[q408 + 1])) {
                    return true;
                }
            }
        }
        return false;
    }
    private static segmentsIntersect(g408: Point2D, h408: Point2D, i408: Point2D, j408: Point2D): boolean {
        const k408: number = (h408.x - g408.x) * (j408.y - i408.y) - (h408.y - g408.y) * (j408.x - i408.x);
        if (Math.abs(k408) < 1e-10) {
            return false;
        }
        const l408: number = ((i408.x - g408.x) * (j408.y - i408.y) - (i408.y - g408.y) * (j408.x - i408.x)) / k408;
        const m408: number = ((i408.x - g408.x) * (h408.y - g408.y) - (i408.y - g408.y) * (h408.x - g408.x)) / k408;
        return l408 >= 0 && l408 <= 1 && m408 >= 0 && m408 <= 1;
    }
}
