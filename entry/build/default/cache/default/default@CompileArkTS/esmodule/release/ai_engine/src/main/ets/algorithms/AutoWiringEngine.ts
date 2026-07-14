import { WireStyle, NetType, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ComponentInstance, Wire, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface WiringNode {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: WiringNode | null;
}
export class AutoWiringEngine {
    private gridSize: number = 10;
    autoWire(d272: SchematicDocument): SchematicDocument {
        const e272 = JSON.parse(JSON.stringify(d272)) as SchematicDocument;
        const f272 = e272.components.find(g272 => g272.libraryId.includes('STM32') || g272.libraryId.includes('AT89') || g272.libraryId.includes('STC'));
        if (!f272)
            return e272;
        this.ensurePowerNets(e272);
        this.wireMcuMinimumSystem(e272, f272);
        this.optimizeWirePaths(e272);
        return e272;
    }
    private ensurePowerNets(y271: SchematicDocument): void {
        const z271 = y271.nets.some(c272 => c272.name === 'VCC' || c272.type === NetType.POWER);
        const a272 = y271.nets.some(b272 => b272.name === 'GND' || b272.type === NetType.GROUND);
        if (!z271) {
            y271.nets.push({ id: IdUtil.generate('net'), name: 'VCC', type: NetType.POWER, pinIds: [] });
        }
        if (!a272) {
            y271.nets.push({ id: IdUtil.generate('net'), name: 'GND', type: NetType.GROUND, pinIds: [] });
        }
    }
    private wireMcuMinimumSystem(k271: SchematicDocument, l271: ComponentInstance): void {
        const m271 = k271.components.find(x271 => x271.libraryId.includes('XTAL'));
        const n271 = k271.components.filter(w271 => w271.libraryId.startsWith('C_'));
        const o271 = k271.components.filter(v271 => v271.libraryId.startsWith('R_'));
        const p271 = k271.nets.find(u271 => u271.name === 'VCC')!;
        const q271 = k271.nets.find(t271 => t271.name === 'GND')!;
        if (m271) {
            this.createWireBetween(k271, l271, m271, p271.id);
        }
        for (const s271 of n271.slice(0, 2)) {
            this.createWireBetween(k271, s271, l271, p271.id);
            this.createWireToGround(k271, s271, q271.id);
        }
        for (const r271 of o271.slice(0, 1)) {
            this.createWireBetween(k271, r271, l271, p271.id);
        }
    }
    private createWireBetween(c271: SchematicDocument, d271: ComponentInstance, e271: ComponentInstance, f271: string): void {
        const g271: Point2D = { x: d271.position.x + 60, y: d271.position.y + 20 };
        const h271: Point2D = { x: e271.position.x, y: e271.position.y + 20 };
        const i271 = this.findPath(g271, h271, c271.components);
        const j271: Wire = {
            id: IdUtil.generate('wire'),
            netId: f271,
            points: i271,
            style: WireStyle.ORTHOGONAL
        };
        c271.wires.push(j271);
    }
    private createWireToGround(x270: SchematicDocument, y270: ComponentInstance, z270: string): void {
        const a271: Point2D = { x: y270.position.x + 20, y: y270.position.y + 40 };
        const b271: Point2D = { x: y270.position.x + 20, y: y270.position.y + 80 };
        x270.wires.push({
            id: IdUtil.generate('wire'),
            netId: z270,
            points: [a271, { x: a271.x, y: (a271.y + b271.y) / 2 }, b271],
            style: WireStyle.ORTHOGONAL
        });
    }
    private findPath(l270: Point2D, m270: Point2D, n270: ComponentInstance[]): Point2D[] {
        const o270: WiringNode[] = [];
        const p270: Set<string> = new Set();
        const q270: WiringNode = {
            x: this.snap(l270.x), y: this.snap(l270.y),
            g: 0,
            h: this.heuristic(l270, m270),
            f: 0, parent: null
        };
        q270.f = q270.g + q270.h;
        o270.push(q270);
        while (o270.length > 0) {
            o270.sort((v270, w270) => v270.f - w270.f);
            const r270 = o270.shift()!;
            const s270 = `${r270.x},${r270.y}`;
            if (p270.has(s270))
                continue;
            p270.add(s270);
            if (Math.abs(r270.x - m270.x) < this.gridSize && Math.abs(r270.y - m270.y) < this.gridSize) {
                return this.reconstructPath(r270);
            }
            for (const t270 of this.getNeighbors(r270, n270)) {
                const u270 = `${t270.x},${t270.y}`;
                if (p270.has(u270))
                    continue;
                t270.g = r270.g + this.gridSize;
                t270.h = this.heuristic({ x: t270.x, y: t270.y }, m270);
                t270.f = t270.g + t270.h;
                t270.parent = r270;
                o270.push(t270);
            }
            if (p270.size > 500)
                break;
        }
        return [l270, { x: l270.x, y: m270.y }, m270];
    }
    private getNeighbors(c270: WiringNode, d270: ComponentInstance[]): WiringNode[] {
        const e270 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const f270: WiringNode[] = [];
        for (let g270 = 0; g270 < e270.length; g270++) {
            const h270 = e270[g270][0];
            const i270 = e270[g270][1];
            const j270 = c270.x + h270 * this.gridSize;
            const k270 = c270.y + i270 * this.gridSize;
            if (!this.isBlocked(j270, k270, d270)) {
                f270.push({ x: j270, y: k270, g: 0, h: 0, f: 0, parent: null });
            }
        }
        return f270;
    }
    private isBlocked(y269: number, z269: number, a270: ComponentInstance[]): boolean {
        for (const b270 of a270) {
            if (y269 >= b270.position.x && y269 <= b270.position.x + 60 &&
                z269 >= b270.position.y && z269 <= b270.position.y + 40) {
                return true;
            }
        }
        return false;
    }
    private heuristic(w269: Point2D, x269: Point2D): number {
        return Math.abs(w269.x - x269.x) + Math.abs(w269.y - x269.y);
    }
    private reconstructPath(t269: WiringNode): Point2D[] {
        const u269: Point2D[] = [];
        let v269: WiringNode | null = t269;
        while (v269) {
            u269.unshift({ x: v269.x, y: v269.y });
            v269 = v269.parent;
        }
        return this.simplifyPath(u269);
    }
    private simplifyPath(l269: Point2D[]): Point2D[] {
        if (l269.length <= 2)
            return l269;
        const m269: Point2D[] = [l269[0]];
        for (let n269 = 1; n269 < l269.length - 1; n269++) {
            const o269 = l269[n269 - 1];
            const p269 = l269[n269];
            const q269 = l269[n269 + 1];
            const r269 = o269.x === p269.x && p269.x === q269.x;
            const s269 = o269.y === p269.y && p269.y === q269.y;
            if (!r269 && !s269)
                m269.push(p269);
        }
        m269.push(l269[l269.length - 1]);
        return m269;
    }
    private optimizeWirePaths(j269: SchematicDocument): void {
        for (const k269 of j269.wires) {
            if (k269.points.length > 2) {
                k269.points = this.simplifyPath(k269.points);
            }
        }
    }
    private snap(i269: number): number {
        return Math.round(i269 / this.gridSize) * this.gridSize;
    }
}
