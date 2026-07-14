import type { Point2D, RouteResult, DeviceInst, RouteLine } from 'common';
export class EditorInternals {
    static calcSnapPoint(rawX: number, rawY: number, gridStep: number): Point2D {
        const result: Point2D = {
            x: Math.round(rawX / gridStep) * gridStep,
            y: Math.round(rawY / gridStep) * gridStep
        };
        return result;
    }
    static checkPinConnect(x: number, y: number, devices: DeviceInst[], threshold: number = 8): string {
        for (let i = 0; i < devices.length; i++) {
            const dev: DeviceInst = devices[i];
            const pinX: number = dev.mirrorH ? dev.x : dev.x + 60;
            const pinY: number = dev.y + 20;
            if (Math.abs(x - pinX) < threshold && Math.abs(y - pinY) < threshold) {
                return `${dev.instUuid}_P1`;
            }
        }
        return '';
    }
    static calcRouteCrossCount(route: RouteResult): number {
        let crosses = 0;
        const lines: RouteLine[] = route.routeLines;
        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                if (EditorInternals.linesIntersect(lines[i].points, lines[j].points)) {
                    crosses++;
                }
            }
        }
        return crosses;
    }
    static calcTotalLength(route: RouteResult): number {
        let total = 0;
        const lines: RouteLine[] = route.routeLines;
        for (let li = 0; li < lines.length; li++) {
            const line: RouteLine = lines[li];
            for (let i = 1; i < line.points.length; i++) {
                const dx: number = line.points[i].x - line.points[i - 1].x;
                const dy: number = line.points[i].y - line.points[i - 1].y;
                total += Math.sqrt(dx * dx + dy * dy);
            }
        }
        return total;
    }
    private static linesIntersect(a: Point2D[], b: Point2D[]): boolean {
        if (a.length < 2 || b.length < 2) {
            return false;
        }
        for (let i = 0; i < a.length - 1; i++) {
            for (let j = 0; j < b.length - 1; j++) {
                if (EditorInternals.segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) {
                    return true;
                }
            }
        }
        return false;
    }
    private static segmentsIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
        const d: number = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
        if (Math.abs(d) < 1e-10) {
            return false;
        }
        const t: number = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
        const u: number = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
}
