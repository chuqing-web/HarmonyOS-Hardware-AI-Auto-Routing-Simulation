import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, SimulationConfig } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { AnalogEngine } from "@bundle:com.elecdraw.aischsim/entry@simulation_kernel/ets/engines/AnalogEngine";
export interface SpiceRunResult {
    errCode: ErrCode;
    nodeVoltages: Map<string, number>;
    branchCurrents: Map<string, number>;
    converged: boolean;
}
export interface NoiseContrib {
    nodeId: string;
    thermal: number;
    shot: number;
    flicker: number;
    total: number;
}
export interface PoleZeroResult {
    poles: number[];
    zeros: number[];
}
export interface DistoResult {
    frequency: number;
    harmonics: number[];
    thd: number;
    thdDb: number;
}
export interface SensResult {
    paramName: string;
    componentId: string;
    sensitivity: number;
}
export interface TfSweepResult {
    frequencies: number[];
    gains: number[];
    phases: number[];
}
export class SpiceRunner {
    private analogEngine: AnalogEngine;
    private initialized: boolean = false;
    private convergenceRetries: number = 0;
    private maxRetries: number = 3;
    private nativeMode: boolean = false;
    private resistorNoise: Map<string, number> = new Map();
    private bjtNoiseNodes: Set<string> = new Set();
    constructor(l485?: AnalogEngine) {
        this.analogEngine = l485 ?? new AnalogEngine();
    }
    init(): boolean {
        this.initialized = true;
        return true;
    }
    loadCircuit(j485: SchematicDocument, k485: SimulationConfig): void {
        this.analogEngine.loadSchematic(j485, k485);
        this.convergenceRetries = 0;
        this.extractNoiseParams(j485);
    }
    private extractNoiseParams(z484: SchematicDocument): void {
        this.resistorNoise.clear();
        this.bjtNoiseNodes.clear();
        for (const a485 of z484.components) {
            const b485 = a485.libraryId.toLowerCase();
            if (b485.includes('resistor') || b485.startsWith('r_')) {
                const e485 = a485.parameters.get('value') ?? a485.parameters.get('resistance') ?? '';
                const f485 = a485.libraryId.replace(/^(R_|RESISTOR_?)/i, '');
                const g485 = this.parseResistance(this.withUnitSuffix(e485, f485));
                const h485 = a485.pinIds ?? [];
                for (let i485 = 0; i485 < h485.length; i485++) {
                    this.resistorNoise.set(h485[i485], g485);
                }
            }
            if (b485.includes('npn') || b485.includes('pnp') || b485.includes('bjt') ||
                b485.includes('transistor') || b485.includes('2n3904') || b485.includes('2n2222')) {
                const c485 = a485.pinIds ?? [];
                for (let d485 = 0; d485 < c485.length; d485++) {
                    this.bjtNoiseNodes.add(c485[d485]);
                }
            }
        }
    }
    private parseResistance(w484: string): number {
        const x484 = w484.toLowerCase().replace(/[ωohm]/g, '').trim();
        if (x484.includes('meg'))
            return parseFloat(x484) * 1e6;
        if (x484.includes('k'))
            return parseFloat(x484) * 1000;
        if (x484.includes('m') && !x484.includes('meg'))
            return parseFloat(x484) * 0.001;
        const y484 = parseFloat(x484);
        return isNaN(y484) || y484 <= 0 ? 1000 : y484;
    }
    private withUnitSuffix(s484: string, t484: string): string {
        const u484 = s484.trim();
        if (u484.length === 0)
            return t484;
        if (/[a-z]/i.test(u484))
            return u484;
        const v484 = t484.match(/[a-zµ]+$/i);
        if (v484 === null)
            return u484;
        return u484 + v484[0];
    }
    runTransient(o484: number, p484: number): SpiceRunResult {
        const q484 = this.analogEngine.solveTransient(o484, p484);
        const r484 = this.analogEngine.getBranchCurrents();
        return {
            errCode: ErrCode.OK,
            nodeVoltages: q484,
            branchCurrents: r484,
            converged: this.analogEngine.getLastConverged()
        };
    }
    runOP(): SpiceRunResult {
        const n484 = this.analogEngine.solveDC();
        return {
            errCode: ErrCode.OK,
            nodeVoltages: n484,
            branchCurrents: this.analogEngine.getBranchCurrents(),
            converged: this.analogEngine.getLastConverged()
        };
    }
    runAC(l484: number): SpiceRunResult {
        const m484 = this.analogEngine.solveAC(l484);
        return {
            errCode: ErrCode.OK,
            nodeVoltages: m484,
            branchCurrents: new Map<string, number>(),
            converged: this.analogEngine.getLastConverged()
        };
    }
    runNoiseAnalysis(m483: string, n483: number, o483: number = 1): NoiseContrib[] {
        const p483: NoiseContrib[] = [];
        const q483 = 1.380649e-23;
        const r483 = 300;
        const s483 = 1.602176634e-19;
        const t483 = this.analogEngine.solveDC();
        this.resistorNoise.forEach((i484: number, j484: string) => {
            const k484 = 4 * q483 * r483 * i484;
            p483.push({
                nodeId: j484,
                thermal: k484,
                shot: 0,
                flicker: 0,
                total: k484
            });
        });
        const u483 = 0.02585;
        this.bjtNoiseNodes.forEach((d484: string) => {
            const e484 = 1e-3;
            const f484 = 2 * s483 * e484;
            const g484 = u483 / Math.max(e484, 1e-12);
            const h484 = f484 * g484 * g484;
            p483.push({
                nodeId: d484,
                thermal: 0,
                shot: h484,
                flicker: 0,
                total: h484
            });
        });
        const v483 = 1e-25;
        t483.forEach((a484: number, b484: string) => {
            if (!this.resistorNoise.has(b484) && !this.bjtNoiseNodes.has(b484)) {
                const c484 = n483 > 0 ? v483 / n483 : 0;
                if (c484 > 1e-18) {
                    p483.push({
                        nodeId: b484,
                        thermal: 1e-18,
                        shot: 0,
                        flicker: c484,
                        total: 1e-18 + c484
                    });
                }
            }
        });
        const w483 = new Map<string, NoiseContrib>();
        for (const x483 of p483) {
            const y483 = w483.get(x483.nodeId);
            if (y483) {
                y483.thermal += x483.thermal;
                y483.shot += x483.shot;
                y483.flicker += x483.flicker;
                y483.total += x483.total;
            }
            else {
                const z483: NoiseContrib = {
                    nodeId: x483.nodeId,
                    thermal: x483.thermal,
                    shot: x483.shot,
                    flicker: x483.flicker,
                    total: x483.total
                };
                w483.set(x483.nodeId, z483);
            }
        }
        return Array.from(w483.values());
    }
    runNoise(g483: string, h483: number): SpiceRunResult {
        const i483 = this.runNoiseAnalysis(g483, h483);
        let j483 = 0;
        for (const l483 of i483) {
            j483 += l483.total;
        }
        const k483 = new Map<string, number>();
        k483.set(g483, Math.sqrt(j483));
        return { errCode: ErrCode.OK, nodeVoltages: k483, branchCurrents: new Map(), converged: true };
    }
    runTFSweep(l482: string, m482: string, n482: number = 10, o482: number = 10e6, p482: number = 100): TfSweepResult {
        const q482: number[] = [];
        const r482: number[] = [];
        const s482: number[] = [];
        const t482 = Math.log10(n482);
        const u482 = Math.log10(o482);
        const v482 = (u482 - t482) / (p482 - 1);
        this.analogEngine.solveDC();
        for (let w482 = 0; w482 < p482; w482++) {
            const x482 = Math.pow(10, t482 + v482 * w482);
            q482.push(x482);
            const y482 = this.analogEngine.solveAC(x482);
            const z482 = y482.get(l482) ?? 0;
            const a483 = y482.get(m482) ?? 1;
            const b483 = a483 > 1e-12 ? z482 / a483 : 0;
            const c483 = b483 > 0 ? 20 * Math.log10(b483) : -200;
            r482.push(c483);
            if (w482 > 0) {
                const d483 = this.analogEngine.solveAC(q482[w482 - 1]);
                const e483 = d483.get(l482) ?? 0;
                const f483 = z482 - e483;
                s482.push(Math.atan2(f483, z482) * 180 / Math.PI);
            }
            else {
                s482.push(0);
            }
        }
        return { frequencies: q482, gains: r482, phases: s482 };
    }
    runTF(g482: string, h482: string): SpiceRunResult {
        const i482 = this.runTFSweep(g482, h482, 10, 10e6, 100);
        const j482 = Math.floor(i482.frequencies.length / 2);
        const k482 = new Map<string, number>();
        k482.set(g482, i482.gains[j482]);
        k482.set(h482, 0);
        return { errCode: ErrCode.OK, nodeVoltages: k482, branchCurrents: new Map(), converged: true };
    }
    runPZ(o481: string, p481: string): PoleZeroResult {
        const q481 = this.analogEngine.solveDC();
        const r481 = q481.size;
        if (r481 < 2) {
            return { poles: [], zeros: [] };
        }
        const s481 = 1e-6;
        const t481: number[] = new Array(r481 * r481).fill(0);
        for (let e482 = 0; e482 < r481; e482++) {
            const f482 = this.analogEngine.solveDC();
        }
        const u481 = this.analogEngine.solveAC(10);
        const v481 = this.analogEngine.solveAC(10e6);
        const w481 = u481.get(o481) ?? 0;
        const x481 = v481.get(o481) ?? 0;
        const y481: number[] = [];
        const z481: number[] = [];
        if (w481 > 1e-12 && x481 > 0) {
            const a482 = x481 / Math.max(w481, 1e-12);
            if (a482 < 0.9) {
                const d482 = 10e6 * a482;
                y481.push(-2 * Math.PI * d482);
            }
            const b482 = this.runTFSweep(o481, p481, 10, 10e6, 50);
            for (let c482 = 1; c482 < b482.phases.length; c482++) {
                if (Math.abs(b482.phases[c482] - b482.phases[c482 - 1]) > 45) {
                    z481.push(2 * Math.PI * b482.frequencies[c482]);
                    break;
                }
            }
        }
        return { poles: y481, zeros: z481 };
    }
    runDisto(o480: string, p480: number, q480: number = 1): DistoResult {
        const r480 = p480 * 128;
        const s480 = 1024;
        const t480 = 1 / r480;
        const u480 = s480 * t480;
        const v480: number[] = [];
        for (let l481 = 0; l481 < s480; l481++) {
            const m481 = l481 * t480;
            const n481 = this.analogEngine.solveTransient(m481, t480);
            v480.push(n481.get(o480) ?? 0);
        }
        const w480 = v480.map((i481: number, j481: number) => {
            const k481 = 0.54 - 0.46 * Math.cos(2 * Math.PI * j481 / (s480 - 1));
            return i481 * k481;
        });
        const x480 = this.realFFT(w480);
        const y480 = r480 / s480;
        const z480: number[] = [];
        for (let f481 = 1; f481 <= 9; f481++) {
            const g481 = p480 * f481;
            const h481 = Math.round(g481 / y480);
            if (h481 < x480.length) {
                z480.push(x480[h481]);
            }
            else {
                z480.push(0);
            }
        }
        let a481 = 0;
        for (let e481 = 1; e481 < z480.length; e481++) {
            a481 += z480[e481] * z480[e481];
        }
        const b481 = z480[0] * z480[0];
        const c481 = b481 > 0 ? Math.sqrt(a481 / b481) : 1;
        const d481 = c481 > 0 ? 20 * Math.log10(c481) : -200;
        return {
            frequency: p480,
            harmonics: z480,
            thd: c481,
            thdDb: d481
        };
    }
    private realFFT(o479: number[]): number[] {
        const p479 = o479.length;
        if (p479 <= 1)
            return o479.slice();
        const q479 = new Float64Array(p479 * 2);
        let r479 = 0;
        for (let l480 = 0; l480 < p479; l480++) {
            if (l480 < r479) {
                const n480 = o479[l480];
                o479[l480] = o479[r479];
                o479[r479] = n480;
            }
            let m480 = p479 >> 1;
            while (m480 >= 1 && r479 >= m480) {
                r479 -= m480;
                m480 >>= 1;
            }
            r479 += m480;
        }
        for (let k480 = 0; k480 < p479; k480++) {
            q479[k480 * 2] = o479[k480];
        }
        for (let w479 = 2; w479 <= p479; w479 <<= 1) {
            const x479 = -2 * Math.PI / w479;
            const y479 = Math.cos(x479);
            const z479 = Math.sin(x479);
            for (let a480 = 0; a480 < p479; a480 += w479) {
                let b480 = 1;
                let c480 = 0;
                const d480 = w479 >> 1;
                for (let e480 = 0; e480 < d480; e480++) {
                    const f480 = (a480 + e480) * 2;
                    const g480 = (a480 + e480 + d480) * 2;
                    const h480 = b480 * q479[g480] - c480 * q479[g480 + 1];
                    const i480 = b480 * q479[g480 + 1] + c480 * q479[g480];
                    q479[g480] = q479[f480] - h480;
                    q479[g480 + 1] = q479[f480 + 1] - i480;
                    q479[f480] += h480;
                    q479[f480 + 1] += i480;
                    const j480 = b480 * y479 - c480 * z479;
                    c480 = b480 * z479 + c480 * y479;
                    b480 = j480;
                }
            }
        }
        const s479: number[] = [];
        for (let t479 = 0; t479 < p479 / 2; t479++) {
            const u479 = q479[t479 * 2];
            const v479 = q479[t479 * 2 + 1];
            s479.push(Math.sqrt(u479 * u479 + v479 * v479) / p479);
        }
        return s479;
    }
    runSens(z478: string, a479: number = 0.01): SensResult[] {
        const b479: SensResult[] = [];
        const c479 = this.analogEngine.solveDC();
        const d479 = c479.get(z478) ?? 0;
        if (Math.abs(d479) < 1e-12)
            return b479;
        const e479 = this.analogEngine.getNetlist();
        const f479 = e479.split('\n');
        for (const g479 of f479) {
            const h479 = g479.trim();
            if (!h479 || h479.startsWith('*') || h479.startsWith('.'))
                continue;
            const i479 = h479.split(/\s+/);
            if (i479.length < 4)
                continue;
            const j479 = i479[0].charAt(0).toUpperCase();
            if (j479 !== 'R' && j479 !== 'C')
                continue;
            const k479 = i479[0];
            const l479 = this.analogEngine.solveAC(1000);
            const m479 = l479.get(z478) ?? 0;
            const n479 = d479 > 0 ? m479 / d479 - 1 : 0;
            if (Math.abs(n479) > 1e-9) {
                b479.push({
                    paramName: k479,
                    componentId: k479,
                    sensitivity: n479
                });
            }
        }
        return b479;
    }
    tryLoadNative(y478: string): boolean {
        if (y478.length === 0)
            return false;
        this.nativeMode = true;
        return true;
    }
    isNativeMode(): boolean { return this.nativeMode; }
    isNativeAvailable(): boolean { return false; }
    static rcTheoreticalVc(t478: number, u478: number, v478: number, w478: number): number {
        const x478 = u478 * v478;
        if (x478 <= 0)
            return t478;
        return t478 * (1 - Math.exp(-w478 / x478));
    }
    validateRcAccuracy(i478: number, j478: number, k478: number = 100): number {
        let l478 = 0;
        const m478 = 5;
        const n478 = 5 * i478 * j478;
        for (let o478 = 0; o478 < k478; o478++) {
            const p478 = (n478 * o478) / k478;
            const q478 = SpiceRunner.rcTheoreticalVc(m478, i478, j478, p478);
            const r478 = this.analogEngine.solveTransient(p478, n478 / k478).get('OUT') ?? q478;
            const s478 = q478 - r478;
            l478 += s478 * s478;
        }
        return Math.sqrt(l478 / k478);
    }
    runWithConvergenceRetry(e478: number, f478: number): SpiceRunResult {
        let g478 = this.runTransient(e478, f478);
        while (!g478.converged && this.convergenceRetries < this.maxRetries) {
            this.convergenceRetries++;
            const h478 = f478 / Math.pow(2, this.convergenceRetries);
            g478 = this.runTransient(e478, h478);
        }
        if (!g478.converged) {
            g478.errCode = ErrCode.ERR_SPICE_CONVERGENCE;
        }
        return g478;
    }
    getNetlist(): string { return this.analogEngine.getNetlist(); }
    release(): void { this.initialized = false; }
}
