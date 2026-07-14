import { IdUtil, makeDeviceInst } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceInst, LayoutLlmOutput, LayoutConstraintRule, MatchedDevice, PlacementCandidate, PlacementResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { getModuleGroupLists, moduleGroupToRecord, positionsFromChromosome, positionsToRecord, getModuleGroupValues } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
import { runPlacementGaAsync } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PlacementGaWorker";
import type { GaWorkerInput } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PlacementGaWorker";
interface Gene {
    x: number;
    y: number;
    rotate: number;
}
interface ScoredChromosome {
    chrom: Chromosome;
    fitness: number;
}
type Chromosome = Map<string, Gene>;
const GRID = 10;
const CANVAS_W = 800;
const CANVAS_H = 600;
const POP_SIZE = 60;
const GENERATIONS = 50;
export class PlacementOptimizer {
    optimize(k301: MatchedDevice[], l301: LayoutLlmOutput, m301: string[] = [], n301?: SchTopology): PlacementResult {
        const o301 = k301.map((u302, v302) => `dev_${v302}`);
        const p301 = new Map<string, MatchedDevice>();
        o301.forEach((s302, t302) => p301.set(s302, k301[t302]));
        const q301 = new Set(m301);
        let r301 = this.initPopulation(o301, q301, n301);
        for (let f302 = 0; f302 < GENERATIONS; f302++) {
            const g302: ScoredChromosome[] = [];
            for (let p302 = 0; p302 < r301.length; p302++) {
                const q302 = r301[p302];
                const r302: ScoredChromosome = {
                    chrom: q302,
                    fitness: this.fitness(q302, o301, p301, l301)
                };
                g302.push(r302);
            }
            g302.sort((n302, o302) => o302.fitness - n302.fitness);
            const h302: Chromosome[] = [];
            for (let m302 = 0; m302 < Math.min(3, g302.length); m302++) {
                h302.push(g302[m302].chrom);
            }
            while (h302.length < POP_SIZE) {
                const i302 = g302[Math.floor(Math.random() * Math.min(10, g302.length))].chrom;
                const j302 = g302[Math.floor(Math.random() * Math.min(10, g302.length))].chrom;
                h302.push(this.crossover(i302, j302, o301, q301));
                const k302 = h302[h302.length - 1];
                const l302 = f302 < GENERATIONS * 0.3 ? 0.25 : (f302 < GENERATIONS * 0.7 ? 0.15 : 0.05);
                if (Math.random() < l302) {
                    this.mutate(k302, o301, q301);
                }
            }
            r301 = h302;
        }
        const s301: ScoredChromosome[] = [];
        for (let c302 = 0; c302 < r301.length; c302++) {
            const d302 = r301[c302];
            const e302: ScoredChromosome = {
                chrom: d302,
                fitness: this.fitness(d302, o301, p301, l301)
            };
            s301.push(e302);
        }
        s301.sort((a302, b302) => b302.fitness - a302.fitness);
        const t301: PlacementCandidate[] = [];
        const u301 = Math.min(3, s301.length);
        for (let x301 = 0; x301 < u301; x301++) {
            const y301 = s301[x301];
            const z301: PlacementCandidate = {
                devicePositions: positionsToRecord(positionsFromChromosome(y301.chrom)),
                fitnessScore: y301.fitness
            };
            t301.push(z301);
        }
        const v301 = s301[0];
        const w301 = this.buildTopology(k301, v301.chrom, n301);
        this.postProcessAlign(w301, l301);
        return { topology: w301, candidates: t301, selectedIndex: 0 };
    }
    async optimizeAsync(s300: MatchedDevice[], t300: LayoutLlmOutput, u300: string[] = [], v300?: SchTopology): Promise<PlacementResult> {
        if (s300.length < 4) {
            return this.optimize(s300, t300, u300, v300);
        }
        try {
            const x300 = s300.map((i301: MatchedDevice, j301: number) => `dev_${j301}`);
            const y300: number[] = [];
            for (let g301 = 0; g301 < x300.length; g301++) {
                const h301 = v300?.deviceList[g301];
                y300.push(h301?.x ?? 100 + g301 * 40, h301?.y ?? 100, h301?.rotate ?? 0);
            }
            const z300: GaWorkerInput = {
                deviceCount: s300.length,
                popSize: POP_SIZE,
                generations: GENERATIONS,
                canvasW: CANVAS_W,
                canvasH: CANVAS_H,
                grid: GRID,
                seedGenes: y300
            };
            const a301 = await runPlacementGaAsync(z300);
            const b301: Chromosome = new Map();
            for (let e301 = 0; e301 < x300.length; e301++) {
                const f301: Gene = {
                    x: this.snap(a301.bestGenes[e301 * 3]),
                    y: this.snap(a301.bestGenes[e301 * 3 + 1]),
                    rotate: a301.bestGenes[e301 * 3 + 2]
                };
                b301.set(x300[e301], f301);
            }
            const c301 = this.buildTopology(s300, b301, v300);
            this.postProcessAlign(c301, t300);
            const d301: PlacementCandidate = {
                devicePositions: positionsToRecord(positionsFromChromosome(b301)),
                fitnessScore: a301.bestFitness
            };
            return { topology: c301, candidates: [d301], selectedIndex: 0 };
        }
        catch (w300) {
            return this.optimize(s300, t300, u300, v300);
        }
    }
    static defaultConstraints(e300: MatchedDevice[]): LayoutLlmOutput {
        const f300 = getModuleGroupLists();
        const g300: LayoutConstraintRule[] = [];
        let h300 = '';
        for (let p300 = 0; p300 < e300.length; p300++) {
            const q300 = e300[p300];
            const r300 = q300.name.substring(0, 12);
            if (q300.moduleZone === 'mcu_core' || q300.libDevId.includes('STM32') || q300.libDevId.includes('AT89')) {
                f300.mcuCore.push(r300);
                if (!h300) {
                    h300 = r300;
                }
            }
            else if (q300.moduleZone === 'power') {
                f300.power.push(r300);
            }
            else {
                f300.peripheral.push(r300);
            }
        }
        if (h300) {
            const l300: LayoutConstraintRule = { type: 'central', target: h300, weight: 100 };
            g300.push(l300);
            for (let m300 = 0; m300 < e300.length; m300++) {
                const n300 = e300[m300];
                if (n300.libDevId.includes('XTAL') || n300.requirement.devType === 'crystal') {
                    const o300: LayoutConstraintRule = {
                        type: 'adjacent',
                        a: h300, b: n300.name.substring(0, 12),
                        weight: 100
                    };
                    g300.push(o300);
                }
            }
        }
        const i300: LayoutConstraintRule = {
            type: 'separate', a: 'power', b: 'analog', minDistance: 150, weight: 80
        };
        g300.push(i300);
        const j300: Record<string, number> = {};
        j300['clk_xtal'] = 10;
        j300['power_net'] = 10;
        j300['analog_adc'] = 8;
        j300['digital_gpio'] = 3;
        const k300: LayoutLlmOutput = {
            moduleGroup: moduleGroupToRecord(f300),
            constraintRules: g300,
            signalWeight: j300
        };
        return k300;
    }
    private initPopulation(t299: string[], u299: Set<string>, v299?: SchTopology): Chromosome[] {
        const w299: Chromosome[] = [];
        for (let x299 = 0; x299 < POP_SIZE; x299++) {
            const y299: Chromosome = new Map();
            for (let z299 = 0; z299 < t299.length; z299++) {
                const a300 = t299[z299];
                const b300 = v299?.deviceList[z299];
                if (u299.has(b300?.instUuid ?? '')) {
                    const d300: Gene = {
                        x: b300!.x,
                        y: b300!.y,
                        rotate: b300!.rotate
                    };
                    y299.set(a300, d300);
                }
                else {
                    const c300: Gene = {
                        x: this.snap(100 + (z299 % 5) * 120 + Math.random() * 40),
                        y: this.snap(80 + Math.floor(z299 / 5) * 100 + Math.random() * 40),
                        rotate: [0, 0, 0, 90][Math.floor(Math.random() * 4)]
                    };
                    y299.set(a300, c300);
                }
            }
            w299.push(y299);
        }
        return w299;
    }
    private fitness(j299: Chromosome, k299: string[], l299: Map<string, MatchedDevice>, m299: LayoutLlmOutput): number {
        let n299 = 0;
        const o299: Gene[] = [];
        for (let r299 = 0; r299 < k299.length; r299++) {
            const s299 = j299.get(k299[r299]);
            if (s299) {
                o299.push(s299);
            }
        }
        n299 += this.evalAdjacency(j299, k299, m299, l299) * 0.4;
        n299 += this.evalModuleIsolation(l299, k299, j299) * 0.25;
        n299 += this.evalWireLength(k299, j299) * 0.2;
        n299 += this.evalHighFreqIsolation(l299, k299, j299) * 0.15;
        n299 -= this.evalOverlap(o299) * 0.5;
        for (let p299 = 0; p299 < m299.constraintRules.length; p299++) {
            const q299 = m299.constraintRules[p299];
            n299 += this.evalRule(q299, j299, k299, l299) * (q299.weight / 100);
        }
        return n299;
    }
    private evalAdjacency(z298: Chromosome, a299: string[], b299: LayoutLlmOutput, c299: Map<string, MatchedDevice>): number {
        let d299 = 0;
        for (let e299 = 0; e299 < b299.constraintRules.length; e299++) {
            const f299 = b299.constraintRules[e299];
            if (f299.type !== 'adjacent' || !f299.a || !f299.b) {
                continue;
            }
            const g299 = this.findGeneByLabel(z298, a299, f299.a, c299);
            const h299 = this.findGeneByLabel(z298, a299, f299.b, c299);
            if (!g299 || !h299) {
                continue;
            }
            const i299 = Math.hypot(g299.x - h299.x, g299.y - h299.y);
            d299 += Math.max(0, 200 - i299);
        }
        return d299;
    }
    private evalModuleIsolation(m298: Map<string, MatchedDevice>, n298: string[], o298: Chromosome): number {
        let p298 = 0;
        const q298: Gene[] = [];
        const r298: Gene[] = [];
        for (let v298 = 0; v298 < n298.length; v298++) {
            const w298 = n298[v298];
            const x298 = m298.get(w298);
            if (!x298) {
                continue;
            }
            const y298 = o298.get(w298);
            if (!y298) {
                continue;
            }
            if (x298.moduleZone === 'analog') {
                q298.push(y298);
            }
            else if (x298.moduleZone === 'digital_periph') {
                r298.push(y298);
            }
        }
        for (let s298 = 0; s298 < q298.length; s298++) {
            for (let t298 = 0; t298 < r298.length; t298++) {
                const u298 = Math.hypot(q298[s298].x - r298[t298].x, q298[s298].y - r298[t298].y);
                if (u298 < 100) {
                    p298 += (100 - u298);
                }
            }
        }
        return Math.max(0, 500 - p298);
    }
    private evalWireLength(g298: string[], h298: Chromosome): number {
        if (g298.length < 2) {
            return 100;
        }
        let i298 = 0;
        for (let j298 = 1; j298 < g298.length; j298++) {
            const k298 = h298.get(g298[j298 - 1]);
            const l298 = h298.get(g298[j298]);
            if (k298 && l298) {
                i298 += Math.abs(k298.x - l298.x) + Math.abs(k298.y - l298.y);
            }
        }
        return Math.max(0, 2000 - i298);
    }
    private evalHighFreqIsolation(w297: Map<string, MatchedDevice>, x297: string[], y297: Chromosome): number {
        let z297: Gene | null = null;
        let a298: Gene | null = null;
        for (let c298 = 0; c298 < x297.length; c298++) {
            const d298 = x297[c298];
            const e298 = w297.get(d298);
            if (!e298) {
                continue;
            }
            const f298 = y297.get(d298);
            if (!f298) {
                continue;
            }
            if (e298.libDevId.includes('XTAL') || e298.requirement.devType === 'crystal') {
                z297 = f298;
            }
            if (e298.moduleZone === 'analog') {
                a298 = f298;
            }
        }
        if (z297 && a298) {
            const b298 = Math.hypot(z297.x - a298.x, z297.y - a298.y);
            return Math.min(200, b298);
        }
        return 100;
    }
    private evalOverlap(q297: Gene[]): number {
        let r297 = 0;
        for (let s297 = 0; s297 < q297.length; s297++) {
            for (let t297 = s297 + 1; t297 < q297.length; t297++) {
                const u297 = q297[s297];
                const v297 = q297[t297];
                if (Math.abs(u297.x - v297.x) < 80 && Math.abs(u297.y - v297.y) < 50) {
                    r297 += 100;
                }
            }
        }
        return r297;
    }
    private evalRule(j297: LayoutConstraintRule, k297: Chromosome, l297: string[], m297: Map<string, MatchedDevice>): number {
        if (j297.type === 'central' && j297.target) {
            const n297 = this.findGeneByLabel(k297, l297, j297.target, m297);
            if (!n297) {
                return 0;
            }
            const o297 = CANVAS_W / 2;
            const p297 = CANVAS_H / 2;
            return Math.max(0, 300 - Math.hypot(n297.x - o297, n297.y - p297));
        }
        if (j297.type === 'separate' && j297.minDistance) {
            return 50;
        }
        return 0;
    }
    private findGeneByLabel(y296: Chromosome, z296: string[], a297: string, b297: Map<string, MatchedDevice>): Gene | null {
        const c297 = a297.toUpperCase();
        for (let d297 = 0; d297 < z296.length; d297++) {
            const e297 = z296[d297];
            const f297 = b297.get(e297);
            if (!f297) {
                continue;
            }
            const g297 = f297.libDevId.toUpperCase();
            const h297 = f297.name.toUpperCase();
            const i297 = f297.requirement.devType.toUpperCase();
            if (g297.includes(c297) || h297.includes(c297) || i297.includes(c297)) {
                return y296.get(e297) ?? null;
            }
        }
        return null;
    }
    private crossover(p296: Chromosome, q296: Chromosome, r296: string[], s296: Set<string>): Chromosome {
        const t296: Chromosome = new Map();
        for (let u296 = 0; u296 < r296.length; u296++) {
            const v296 = r296[u296];
            const w296 = Math.random() < 0.5 ? p296.get(v296) : q296.get(v296);
            if (w296) {
                const x296: Gene = { x: w296.x, y: w296.y, rotate: w296.rotate };
                t296.set(v296, x296);
            }
        }
        return t296;
    }
    private mutate(k296: Chromosome, l296: string[], m296: Set<string>): void {
        const n296 = l296[Math.floor(Math.random() * l296.length)];
        const o296: Gene = {
            x: this.snap(Math.random() * (CANVAS_W - 120) + 60),
            y: this.snap(Math.random() * (CANVAS_H - 100) + 40),
            rotate: [0, 90, 180, 270][Math.floor(Math.random() * 4)]
        };
        k296.set(n296, o296);
    }
    private buildTopology(b296: MatchedDevice[], c296: Chromosome, d296?: SchTopology): SchTopology {
        const e296: DeviceInst[] = [];
        for (let g296 = 0; g296 < b296.length; g296++) {
            const h296 = b296[g296];
            const i296 = c296.get(`dev_${g296}`)!;
            const j296 = h296.libDevId.startsWith('R_') ? 'R' :
                h296.libDevId.startsWith('C_') ? 'C' :
                    h296.libDevId.includes('STM32') || h296.libDevId.includes('AT89') ? 'U' : 'U';
            e296.push(makeDeviceInst(IdUtil.generate('inst'), h296.libDevId, `${j296}${g296 + 1}`, i296.x, i296.y, i296.rotate, h296.params));
        }
        const f296: SchTopology = {
            schUuid: d296?.schUuid ?? IdUtil.generate('sch'),
            schName: d296?.schName ?? 'AI Generated',
            layerDepth: d296?.layerDepth ?? 0,
            deviceList: e296,
            netList: d296?.netList ?? [],
            busList: d296?.busList ?? [],
            wireList: [],
            subCircuitList: d296?.subCircuitList ?? [],
            probeList: d296?.probeList ?? [],
            textAnnotate: d296?.textAnnotate ?? [],
            ercErrorList: [],
            gridStep: GRID,
            bgColor: '#FFFFFF'
        };
        return f296;
    }
    private postProcessAlign(q295: SchTopology, r295: LayoutLlmOutput): void {
        this.applyMcuHardRules(q295);
        const s295 = getModuleGroupValues(r295.moduleGroup);
        for (let t295 = 0; t295 < s295.length; t295++) {
            const u295 = s295[t295];
            if (u295.length < 2) {
                continue;
            }
            const v295 = q295.deviceList.filter(z295 => u295.some(a296 => z295.libDevId.includes(a296) || z295.refName.includes(a296)));
            if (v295.length < 2) {
                continue;
            }
            const w295 = v295[0].y;
            v295.forEach((x295, y295) => {
                x295.y = w295;
                x295.x = this.snap(v295[0].x + y295 * 100);
            });
        }
    }
    private applyMcuHardRules(f295: SchTopology): void {
        const g295 = f295.deviceList.find(p295 => p295.libDevId.includes('STM32') || p295.libDevId.includes('AT89') || p295.libDevId.includes('STC'));
        if (!g295) {
            return;
        }
        g295.x = this.snap(CANVAS_W / 2);
        g295.y = this.snap(CANVAS_H / 2);
        const h295 = f295.deviceList.find(o295 => o295.libDevId.includes('XTAL'));
        if (h295) {
            h295.x = g295.x - 100;
            h295.y = g295.y - 20;
        }
        const i295 = f295.deviceList.filter(n295 => n295.libDevId.startsWith('C_') && n295.libDevId.includes('100'));
        i295.forEach((l295, m295) => {
            l295.x = g295.x + 60 + m295 * 30;
            l295.y = g295.y - 40;
        });
        const j295 = f295.deviceList.find(k295 => k295.libDevId.startsWith('R_'));
        if (j295) {
            j295.x = g295.x + 80;
            j295.y = g295.y + 60;
        }
    }
    private snap(e295: number): number {
        return Math.round(e295 / GRID) * GRID;
    }
}
