import type { SchTopology, RouteResult, RouteLine, RoutingLlmOutput, RoutingWeightPrefs, Point2D, SpecialNetRule } from 'common';
import { cloneRouteResult, getNetPriorityValue, netPriorityMapToRecord } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
import type { NetPriorityHint } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
interface WiringNode {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: WiringNode | null;
}
interface NetRouteTask {
    netUuid: string;
    netName: string;
    priority: number;
    rules: string[];
    pinPositions: Point2D[];
    isPower: boolean;
    isAnalog: boolean;
    isClock: boolean;
    isDiff: boolean;
}
const DEFAULT_WEIGHTS: RoutingWeightPrefs = {
    lineLength: 1.0,
    crossPenalty: 50,
    analogDigitalIsolate: 80,
    xtalShortPath: 100,
    diffEqualLength: 60
};
export class ConstrainedWiringEngine {
    private gridSize: number = 10;
    private weights: RoutingWeightPrefs = DEFAULT_WEIGHTS;
    private obstacleMap: Set<string> = new Set();
    private existingRoutes: RouteLine[] = [];
    route(n277: SchTopology, o277: RoutingLlmOutput, p277?: RoutingWeightPrefs): RouteResult {
        this.weights = p277 ?? DEFAULT_WEIGHTS;
        this.obstacleMap.clear();
        this.existingRoutes = [];
        for (let e278 = 0; e278 < n277.wireList.length; e278++) {
            this.existingRoutes.push(n277.wireList[e278]);
        }
        this.buildObstacleMap(n277);
        const q277 = this.buildNetTasks(n277, o277);
        q277.sort((c278, d278) => d278.priority - c278.priority);
        const r277: RouteLine[] = [];
        let s277 = 0;
        let t277 = 0;
        for (const z277 of q277) {
            if (z277.pinPositions.length < 2)
                continue;
            const a278 = this.routeNet(z277, n277);
            for (const b278 of a278) {
                s277 += this.countCrossings(b278, r277);
                t277 += this.pathLength(b278.points);
                r277.push(b278);
                this.markRouteAsObstacle(b278);
            }
        }
        const u277 = q277.filter(y277 => y277.isClock).every(v277 => {
            const w277 = r277.find(x277 => x277.netUuid === v277.netUuid);
            return w277 ? w277.points.length <= 4 : true;
        });
        return {
            routeLines: r277,
            crossCount: s277,
            totalLineLength: t277,
            isolateAnalogDigital: o277.globalConstraint.includes('separate'),
            xtalShortPath: u277,
            diffLineEqualLength: this.checkDiffEqualLength(r277, q277)
        };
    }
    static defaultConstraints(z276: SchTopology): RoutingLlmOutput {
        const a277: NetPriorityHint[] = [];
        for (let k277 = 0; k277 < z276.netList.length; k277++) {
            const l277 = z276.netList[k277];
            const m277 = l277.netName.toUpperCase();
            a277.push({
                netName: l277.netName,
                isPower: l277.isPower,
                isAnalog: l277.isAnalog,
                isClock: m277.includes('XTAL') || m277.includes('CLK')
            });
        }
        const b277 = new Map<string, number>();
        b277.set('GND', 10);
        b277.set('VCC', 10);
        b277.set('VDD', 10);
        b277.set('3V3', 10);
        for (let h277 = 0; h277 < a277.length; h277++) {
            const i277 = a277[h277];
            const j277 = i277.netName.toUpperCase();
            if (i277.isClock) {
                b277.set(i277.netName, 9);
            }
            else if (i277.isAnalog) {
                b277.set(i277.netName, 7);
            }
            else if (i277.isPower) {
                b277.set(i277.netName, 10);
            }
            else if (!b277.has(i277.netName)) {
                b277.set(i277.netName, 2);
            }
        }
        const c277: SpecialNetRule = { netGroup: 'xtal', rule: 'shortest_path,no_cross_analog,min_cross_count' };
        const d277: SpecialNetRule = { netGroup: 'i2c', rule: 'parallel_equal_length,45deg_line' };
        const e277: SpecialNetRule = { netGroup: 'power', rule: 'thick_line,direct_route,no_detour' };
        const f277: SpecialNetRule[] = [c277, d277, e277];
        const g277: RoutingLlmOutput = {
            netPriority: netPriorityMapToRecord(b277),
            specialNetRules: f277,
            globalConstraint: 'analog_net_area separate from digital net_area, bus lines parallel'
        };
        return g277;
    }
    private buildNetTasks(l276: SchTopology, m276: RoutingLlmOutput): NetRouteTask[] {
        const n276: NetRouteTask[] = [];
        for (const o276 of l276.netList) {
            const p276: Point2D[] = [];
            for (const w276 of o276.nodeList) {
                const x276 = l276.deviceList.find(y276 => y276.instUuid === w276.devUuid);
                if (x276)
                    p276.push({ x: x276.x + 30, y: x276.y + 20 });
            }
            if (p276.length === 0 && o276.nodeList.length === 0) {
                const u276 = l276.deviceList.slice(0, 2);
                u276.forEach(v276 => p276.push({ x: v276.x + 30, y: v276.y + 20 }));
            }
            const q276 = o276.netName.toUpperCase();
            const r276 = m276.specialNetRules
                .filter(t276 => q276.includes(t276.netGroup.toUpperCase()) || this.matchNetGroup(q276, t276.netGroup))
                .map(s276 => s276.rule);
            n276.push({
                netUuid: o276.netUuid,
                netName: o276.netName,
                priority: getNetPriorityValue(m276.netPriority, o276.netName, q276, o276.isPower || q276.includes('VCC') || q276.includes('GND') || q276.includes('VDD'), o276.isAnalog),
                rules: r276,
                pinPositions: p276,
                isPower: o276.isPower || q276.includes('VCC') || q276.includes('GND') || q276.includes('VDD'),
                isAnalog: o276.isAnalog,
                isClock: q276.includes('XTAL') || q276.includes('CLK'),
                isDiff: q276.includes('I2C') || q276.includes('SDA') || q276.includes('SCL') || q276.includes('SPI')
            });
        }
        return n276;
    }
    private matchNetGroup(i276: string, j276: string): boolean {
        const k276 = j276.toLowerCase();
        if (k276 === 'xtal')
            return i276.includes('XTAL') || i276.includes('CLK');
        if (k276 === 'power')
            return i276.includes('VCC') || i276.includes('GND');
        if (k276 === 'i2c_sda_scl' || k276 === 'i2c')
            return i276.includes('I2C') || i276.includes('SDA');
        return i276.includes(k276.toUpperCase());
    }
    private routeNet(c276: NetRouteTask, d276: SchTopology): RouteLine[] {
        const e276: RouteLine[] = [];
        const f276 = c276.pinPositions;
        for (let g276 = 0; g276 < f276.length - 1; g276++) {
            const h276 = this.findPath(f276[g276], f276[g276 + 1], c276, d276);
            e276.push({
                netUuid: c276.netUuid,
                points: h276,
                isBus: c276.netName.includes('BUS')
            });
        }
        return e276;
    }
    private findPath(m275: Point2D, n275: Point2D, o275: NetRouteTask, p275: SchTopology): Point2D[] {
        const q275: WiringNode[] = [];
        const r275: Set<string> = new Set();
        const s275 = this.snapPoint(m275);
        const t275 = this.snapPoint(n275);
        const u275: WiringNode = {
            x: s275.x, y: s275.y,
            g: 0,
            h: this.heuristic(s275, t275, o275),
            f: 0, parent: null
        };
        u275.f = u275.g + u275.h;
        q275.push(u275);
        while (q275.length > 0) {
            q275.sort((a276, b276) => a276.f - b276.f);
            const v275 = q275.shift()!;
            const w275 = `${v275.x},${v275.y}`;
            if (r275.has(w275))
                continue;
            r275.add(w275);
            if (Math.abs(v275.x - t275.x) < this.gridSize && Math.abs(v275.y - t275.y) < this.gridSize) {
                return this.simplifyPath(this.reconstructPath(v275));
            }
            for (const x275 of this.getNeighbors(v275, o275, p275)) {
                const y275 = `${x275.x},${x275.y}`;
                if (r275.has(y275))
                    continue;
                const z275 = v275.g + this.moveCost(v275, x275, o275);
                x275.g = z275;
                x275.h = this.heuristic({ x: x275.x, y: x275.y }, t275, o275);
                x275.f = x275.g + x275.h;
                x275.parent = v275;
                q275.push(x275);
            }
            if (r275.size > 800)
                break;
        }
        return o275.isPower ? [s275, { x: s275.x, y: t275.y }, t275] : [s275, t275];
    }
    private moveCost(h275: WiringNode, i275: WiringNode, j275: NetRouteTask): number {
        let k275 = this.gridSize * this.weights.lineLength;
        const l275 = `${i275.x},${i275.y}`;
        if (this.existingRouteOccupies(l275))
            k275 += this.weights.crossPenalty;
        if (j275.isClock)
            k275 *= 0.5;
        if (j275.rules.includes('no_detour') && Math.abs(h275.x - i275.x) + Math.abs(h275.y - i275.y) > this.gridSize * 2) {
            k275 += this.weights.xtalShortPath;
        }
        return k275;
    }
    private heuristic(d275: Point2D, e275: Point2D, f275: NetRouteTask): number {
        const g275 = Math.abs(d275.x - e275.x) + Math.abs(d275.y - e275.y);
        return f275.isClock ? g275 * 0.8 : g275;
    }
    private getNeighbors(t274: WiringNode, u274: NetRouteTask, v274: SchTopology): WiringNode[] {
        const w274 = u274.rules.includes('45deg_line') ?
            [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]] :
            [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const x274: WiringNode[] = [];
        for (let y274 = 0; y274 < w274.length; y274++) {
            const z274 = w274[y274][0];
            const a275 = w274[y274][1];
            const b275 = t274.x + z274 * this.gridSize;
            const c275 = t274.y + a275 * this.gridSize;
            if (!this.isBlocked(b275, c275, u274, v274)) {
                x274.push({ x: b275, y: c275, g: 0, h: 0, f: 0, parent: null });
            }
        }
        return x274;
    }
    private isBlocked(n274: number, o274: number, p274: NetRouteTask, q274: SchTopology): boolean {
        const r274 = `${n274},${o274}`;
        if (this.obstacleMap.has(r274))
            return true;
        for (const s274 of q274.deviceList) {
            if (n274 >= s274.x && n274 <= s274.x + 80 && o274 >= s274.y && o274 <= s274.y + 50) {
                if (p274.isPower)
                    return false;
                return true;
            }
        }
        return false;
    }
    private buildObstacleMap(j274: SchTopology): void {
        for (const k274 of j274.deviceList) {
            for (let l274 = 0; l274 <= 80; l274 += this.gridSize) {
                for (let m274 = 0; m274 <= 50; m274 += this.gridSize) {
                    this.obstacleMap.add(`${this.snap(k274.x + l274)},${this.snap(k274.y + m274)}`);
                }
            }
        }
    }
    private markRouteAsObstacle(h274: RouteLine): void {
        for (const i274 of h274.points) {
            this.obstacleMap.add(`${i274.x},${i274.y}`);
        }
        this.existingRoutes.push(h274);
    }
    private existingRouteOccupies(e274: string): boolean {
        return this.existingRoutes.some(f274 => f274.points.some(g274 => `${g274.x},${g274.y}` === e274));
    }
    private reconstructPath(b274: WiringNode): Point2D[] {
        const c274: Point2D[] = [];
        let d274: WiringNode | null = b274;
        while (d274) {
            c274.unshift({ x: d274.x, y: d274.y });
            d274 = d274.parent;
        }
        return c274;
    }
    private simplifyPath(v273: Point2D[]): Point2D[] {
        if (v273.length <= 2)
            return v273;
        const w273: Point2D[] = [v273[0]];
        for (let x273 = 1; x273 < v273.length - 1; x273++) {
            const y273 = v273[x273 - 1];
            const z273 = v273[x273];
            const a274 = v273[x273 + 1];
            if (!(y273.x === z273.x && z273.x === a274.x) && !(y273.y === z273.y && z273.y === a274.y)) {
                w273.push(z273);
            }
        }
        w273.push(v273[v273.length - 1]);
        return w273;
    }
    private snapPoint(u273: Point2D): Point2D {
        return {
            x: Math.round(u273.x / this.gridSize) * this.gridSize,
            y: Math.round(u273.y / this.gridSize) * this.gridSize
        };
    }
    private snap(t273: number): number {
        return Math.round(t273 / this.gridSize) * this.gridSize;
    }
    private pathLength(q273: Point2D[]): number {
        let r273 = 0;
        for (let s273 = 1; s273 < q273.length; s273++) {
            r273 += Math.abs(q273[s273].x - q273[s273 - 1].x) + Math.abs(q273[s273].y - q273[s273 - 1].y);
        }
        return r273;
    }
    private countCrossings(k273: RouteLine, l273: RouteLine[]): number {
        let m273 = 0;
        for (const n273 of l273) {
            if (n273.netUuid === k273.netUuid)
                continue;
            for (let o273 = 1; o273 < k273.points.length; o273++) {
                for (let p273 = 1; p273 < n273.points.length; p273++) {
                    if (this.segmentsCross(k273.points[o273 - 1], k273.points[o273], n273.points[p273 - 1], n273.points[p273])) {
                        m273++;
                    }
                }
            }
        }
        return m273;
    }
    private segmentsCross(g273: Point2D, h273: Point2D, i273: Point2D, j273: Point2D): boolean {
        return g273.x === h273.x && i273.y === j273.y && g273.x === i273.x && h273.y === j273.y;
    }
    private checkDiffEqualLength(y272: RouteLine[], z272: NetRouteTask[]): boolean {
        const a273 = z272.filter(f273 => f273.isDiff);
        if (a273.length < 2)
            return true;
        const b273 = a273.map(c273 => {
            const d273 = y272.find(e273 => e273.netUuid === c273.netUuid);
            return d273 ? this.pathLength(d273.points) : 0;
        });
        if (b273.length < 2)
            return true;
        return Math.abs(b273[0] - b273[1]) < 30;
    }
    fixViolations(p272: SchTopology, q272: RouteResult): RouteResult {
        const r272 = cloneRouteResult(q272);
        for (const s272 of r272.routeLines) {
            const t272 = p272.netList.find(x272 => x272.netUuid === s272.netUuid);
            const u272 = t272?.netName.toUpperCase() ?? '';
            if (u272.includes('XTAL') && s272.points.length > 4) {
                const v272 = s272.points[0];
                const w272 = s272.points[s272.points.length - 1];
                s272.points = [v272, { x: w272.x, y: v272.y }, w272];
            }
            if (t272?.isPower && s272.points.length > 3) {
                s272.points = this.simplifyPath(s272.points);
            }
        }
        return r272;
    }
}
