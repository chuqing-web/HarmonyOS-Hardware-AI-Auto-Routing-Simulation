import { IdUtil, makeDeviceInst, DeviceHitGeometry, SELECTION_HIT_PAD } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceInst, LayoutLlmOutput, LayoutConstraintRule, MatchedDevice, PlacementCandidate, PlacementResult, WorldHitRect } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { IComponentLibrary } from 'component_library';
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
const CANVAS_W = 1200;
const CANVAS_H = 800;
const POP_SIZE = 60;
const GENERATIONS = 50;
/** 选中区之间额外走线通道 */
const HIT_CHANNEL = 80;
export class PlacementOptimizer {
    private componentLibrary: IComponentLibrary | null = null;
    setComponentLibrary(library: IComponentLibrary): void {
        this.componentLibrary = library;
    }
    /** 公开：按选中区 AABB 消解重叠（AI 坐标布局后调用） */
    resolveSelectionOverlaps(topo: SchTopology): void {
        this.resolveOverlaps(topo);
    }
    optimize(matched: MatchedDevice[], constraints: LayoutLlmOutput, lockedUuids: string[] = [], existingTopo?: SchTopology): PlacementResult {
        const deviceIds = matched.map((_, i) => `dev_${i}`);
        const idToLib = new Map<string, MatchedDevice>();
        deviceIds.forEach((id, i) => idToLib.set(id, matched[i]));
        const locked = new Set(lockedUuids);
        let population = this.initPopulation(deviceIds, locked, existingTopo, idToLib);
        for (let gen = 0; gen < GENERATIONS; gen++) {
            const scored: ScoredChromosome[] = [];
            for (let pi = 0; pi < population.length; pi++) {
                const chrom = population[pi];
                const entry: ScoredChromosome = {
                    chrom: chrom,
                    fitness: this.fitness(chrom, deviceIds, idToLib, constraints)
                };
                scored.push(entry);
            }
            scored.sort((a, b) => b.fitness - a.fitness);
            const next: Chromosome[] = [];
            for (let i = 0; i < Math.min(3, scored.length); i++) {
                next.push(scored[i].chrom);
            }
            while (next.length < POP_SIZE) {
                const p1 = scored[Math.floor(Math.random() * Math.min(10, scored.length))].chrom;
                const p2 = scored[Math.floor(Math.random() * Math.min(10, scored.length))].chrom;
                next.push(this.crossover(p1, p2, deviceIds, locked));
                const last = next[next.length - 1];
                const mutationRate = gen < GENERATIONS * 0.3 ? 0.25 : (gen < GENERATIONS * 0.7 ? 0.15 : 0.05);
                if (Math.random() < mutationRate) {
                    this.mutate(last, deviceIds, locked);
                }
            }
            population = next;
        }
        const finalScored: ScoredChromosome[] = [];
        for (let pi = 0; pi < population.length; pi++) {
            const chrom = population[pi];
            const entry: ScoredChromosome = {
                chrom: chrom,
                fitness: this.fitness(chrom, deviceIds, idToLib, constraints)
            };
            finalScored.push(entry);
        }
        finalScored.sort((a, b) => b.fitness - a.fitness);
        const top3: PlacementCandidate[] = [];
        const topCount = Math.min(3, finalScored.length);
        for (let ti = 0; ti < topCount; ti++) {
            const s = finalScored[ti];
            const candidate: PlacementCandidate = {
                devicePositions: positionsToRecord(positionsFromChromosome(s.chrom)),
                fitnessScore: s.fitness
            };
            top3.push(candidate);
        }
        const best = finalScored[0];
        const topo = this.buildTopology(matched, best.chrom, existingTopo);
        this.postProcessAlign(topo, constraints);
        return { topology: topo, candidates: top3, selectedIndex: 0 };
    }
    /** TaskPool Worker 异步 GA — 器件数 ≥ 4 时在后台线程运行 */
    async optimizeAsync(matched: MatchedDevice[], constraints: LayoutLlmOutput, lockedUuids: string[] = [], existingTopo?: SchTopology): Promise<PlacementResult> {
        if (matched.length < 4) {
            return this.optimize(matched, constraints, lockedUuids, existingTopo);
        }
        try {
            const deviceIds = matched.map((_: MatchedDevice, i: number) => `dev_${i}`);
            const seedGenes: number[] = [];
            const zoneCodes: number[] = [];
            const priorities: number[] = [];
            for (let i = 0; i < matched.length; i++) {
                const m = matched[i];
                const dev = existingTopo?.deviceList[i];
                seedGenes.push(dev?.x ?? 100 + i * 40, dev?.y ?? 100, 0);
                zoneCodes.push(PlacementOptimizer.zoneCodeOf(m));
                priorities.push(m.placementPriority);
            }
            const adjacentPairs = PlacementOptimizer.buildAdjacentPairs(matched, constraints);
            const input: GaWorkerInput = {
                deviceCount: matched.length,
                popSize: POP_SIZE,
                generations: GENERATIONS,
                canvasW: CANVAS_W,
                canvasH: CANVAS_H,
                grid: GRID,
                seedGenes: seedGenes,
                zoneCodes: zoneCodes,
                priorities: priorities,
                adjacentPairs: adjacentPairs
            };
            const workerOut = await runPlacementGaAsync(input);
            if (workerOut.bestGenes.length < matched.length * 3) {
                return this.optimize(matched, constraints, lockedUuids, existingTopo);
            }
            const chrom: Chromosome = new Map();
            for (let i = 0; i < deviceIds.length; i++) {
                const gene: Gene = {
                    x: this.snap(workerOut.bestGenes[i * 3]),
                    y: this.snap(workerOut.bestGenes[i * 3 + 1]),
                    rotate: 0
                };
                chrom.set(deviceIds[i], gene);
            }
            const topo = this.buildTopology(matched, chrom, existingTopo);
            this.postProcessAlign(topo, constraints);
            const candidate: PlacementCandidate = {
                devicePositions: positionsToRecord(positionsFromChromosome(chrom)),
                fitnessScore: workerOut.bestFitness
            };
            return { topology: topo, candidates: [candidate], selectedIndex: 0 };
        }
        catch (_e) {
            return this.optimize(matched, constraints, lockedUuids, existingTopo);
        }
    }
    private static zoneCodeOf(m: MatchedDevice): number {
        const id = m.libDevId.toUpperCase();
        if (id.includes('STM32') || id.includes('AT89') || id.includes('STC') ||
            m.moduleZone === 'mcu_core' || m.requirement.devType.indexOf('mcu') >= 0) {
            return 0;
        }
        if (id === 'VCC' || id === 'GND' || id.includes('7805') || id.includes('1117') ||
            m.moduleZone === 'power' || m.requirement.devType === 'ldo') {
            return 1;
        }
        if (id.includes('XTAL') || m.requirement.devType === 'crystal') {
            return 2;
        }
        if (id.includes('OSCILLOSCOPE') || id.includes('VOLTMETER') || id.includes('AMMETER') ||
            id.includes('VIRTUAL_METER') || id.includes('FREQ_COUNTER') || id.includes('UART_TERMINAL') ||
            id.includes('LOGIC_ANALYZER') || id.includes('POWER_METER') ||
            m.requirement.devType === 'instrument' || m.requirement.devType === 'oscilloscope' ||
            m.requirement.devType === 'voltmeter' || m.requirement.devType === 'ammeter' ||
            m.requirement.devType === 'multimeter') {
            return 3;
        }
        return 4;
    }
    private static buildAdjacentPairs(matched: MatchedDevice[], constraints: LayoutLlmOutput): number[] {
        const pairs: number[] = [];
        // MCU–晶振
        let mcuIdx = -1;
        let xtalIdx = -1;
        let vccIdx = -1;
        let ammeterIdx = -1;
        for (let i = 0; i < matched.length; i++) {
            const id = matched[i].libDevId.toUpperCase();
            if (mcuIdx < 0 && (id.includes('STM32') || id.includes('AT89') || id.includes('STC'))) {
                mcuIdx = i;
            }
            if (xtalIdx < 0 && id.includes('XTAL')) {
                xtalIdx = i;
            }
            if (vccIdx < 0 && id === 'VCC') {
                vccIdx = i;
            }
            if (ammeterIdx < 0 && id.includes('AMMETER')) {
                ammeterIdx = i;
            }
        }
        if (mcuIdx >= 0 && xtalIdx >= 0) {
            pairs.push(mcuIdx, xtalIdx);
        }
        // v3.0: 电流表紧邻VCC（串联在电源回路中）
        if (vccIdx >= 0 && ammeterIdx >= 0) {
            pairs.push(vccIdx, ammeterIdx);
        }
        // 电压表紧邻对应电阻（优先R_开头的电阻器件）
        for (let vi = 0; vi < matched.length; vi++) {
            const vid = matched[vi].libDevId.toUpperCase();
            if (!vid.includes('VOLTMETER') && !vid.includes('VIRTUAL_METER'))
                continue;
            for (let ri = 0; ri < matched.length; ri++) {
                const rid = matched[ri].libDevId.toUpperCase();
                if (rid.startsWith('R_')) {
                    pairs.push(vi, ri);
                    break; // 每块电压表配一个电阻
                }
            }
        }
        for (let i = 0; i < constraints.constraintRules.length; i++) {
            const rule = constraints.constraintRules[i];
            if (rule.type !== 'adjacent') {
                continue;
            }
            const a = PlacementOptimizer.indexByLabel(matched, rule.a ?? rule.target ?? '');
            const b = PlacementOptimizer.indexByLabel(matched, rule.b ?? '');
            if (a >= 0 && b >= 0) {
                pairs.push(a, b);
            }
        }
        return pairs;
    }
    private static indexByLabel(matched: MatchedDevice[], label: string): number {
        if (label.length === 0) {
            return -1;
        }
        for (let i = 0; i < matched.length; i++) {
            if (matched[i].name.indexOf(label) >= 0 || matched[i].libDevId.indexOf(label) >= 0) {
                return i;
            }
        }
        return -1;
    }
    /** 无 LLM 时生成默认 MCU 布局约束 */
    static defaultConstraints(matched: MatchedDevice[]): LayoutLlmOutput {
        const moduleGroup = getModuleGroupLists();
        const rules: LayoutConstraintRule[] = [];
        let mcuName = '';
        for (let i = 0; i < matched.length; i++) {
            const m = matched[i];
            const label = m.name.substring(0, 12);
            if (m.moduleZone === 'mcu_core' || m.libDevId.includes('STM32') || m.libDevId.includes('AT89')) {
                moduleGroup.mcuCore.push(label);
                if (!mcuName) {
                    mcuName = label;
                }
            }
            else if (m.moduleZone === 'power') {
                moduleGroup.power.push(label);
            }
            else {
                moduleGroup.peripheral.push(label);
            }
        }
        if (mcuName) {
            const centralRule: LayoutConstraintRule = { type: 'central', target: mcuName, weight: 100 };
            rules.push(centralRule);
            for (let i = 0; i < matched.length; i++) {
                const m = matched[i];
                if (m.libDevId.includes('XTAL') || m.requirement.devType === 'crystal') {
                    const adjRule: LayoutConstraintRule = {
                        type: 'adjacent', a: mcuName, b: m.name.substring(0, 12), weight: 100
                    };
                    rules.push(adjRule);
                }
            }
        }
        const sepRule: LayoutConstraintRule = {
            type: 'separate', a: 'power', b: 'analog', minDistance: 220, weight: 80
        };
        rules.push(sepRule);
        const signalWeight: Record<string, number> = {};
        signalWeight['clk_xtal'] = 10;
        signalWeight['power_net'] = 10;
        signalWeight['analog_adc'] = 8;
        signalWeight['digital_gpio'] = 3;
        const layoutOut: LayoutLlmOutput = {
            moduleGroup: moduleGroupToRecord(moduleGroup),
            constraintRules: rules,
            signalWeight: signalWeight
        };
        return layoutOut;
    }
    /** 分组感知初始化: MCU居中→晶振紧邻→电容就近→LED+R配对→仪器靠右 */
    private initPopulation(deviceIds: string[], locked: Set<string>, existing?: SchTopology, idToLib?: Map<string, MatchedDevice>): Chromosome[] {
        const pop: Chromosome[] = [];
        // 预计算种子布局: 按器件类型分区放置
        const seedBase = this.buildSeedLayout(deviceIds, idToLib);
        for (let i = 0; i < POP_SIZE; i++) {
            const chrom: Chromosome = new Map();
            for (let j = 0; j < deviceIds.length; j++) {
                const id = deviceIds[j];
                const existingDev = existing?.deviceList[j];
                if (locked.has(existingDev?.instUuid ?? '')) {
                    chrom.set(id, { x: existingDev!.x, y: existingDev!.y, rotate: 0 });
                }
                else {
                    const seed = seedBase.get(id);
                    const jitterX = i > 0 ? (Math.random() - 0.5) * 80 : 0;
                    const jitterY = i > 0 ? (Math.random() - 0.5) * 80 : 0;
                    chrom.set(id, {
                        x: this.snap((seed?.x ?? 100 + (j % 5) * 120) + jitterX),
                        y: this.snap((seed?.y ?? 80 + Math.floor(j / 5) * 100) + jitterY),
                        rotate: 0
                    });
                }
            }
            pop.push(chrom);
        }
        return pop;
    }
    /** 按器件功能分组计算种子坐标 */
    private buildSeedLayout(deviceIds: string[], idToLib?: Map<string, MatchedDevice>): Map<string, Gene> {
        const seeds = new Map<string, Gene>();
        if (!idToLib)
            return seeds;
        let mcuIdx = -1;
        let xtalIdx = -1;
        let vccIdx = -1;
        let gndIdx = -1;
        const capIdxs: number[] = [];
        const ledIdxs: number[] = [];
        const resIdxs: number[] = [];
        const ammeterIdxs: number[] = [];
        const voltmeterIdxs: number[] = [];
        const instrIdxs: number[] = []; // 非电流表/电压表的其他仪器
        const otherIdxs: number[] = [];
        for (let i = 0; i < deviceIds.length; i++) {
            const m = idToLib.get(deviceIds[i]);
            if (!m) {
                otherIdxs.push(i);
                continue;
            }
            const idUp = m.libDevId.toUpperCase();
            if (idUp.includes('STM32') || idUp.includes('AT89') || idUp.includes('STC')) {
                mcuIdx = i;
            }
            else if (idUp.includes('XTAL')) {
                xtalIdx = i;
            }
            else if (idUp === 'VCC') {
                vccIdx = i;
            }
            else if (idUp === 'GND') {
                gndIdx = i;
            }
            else if (idUp.startsWith('C_')) {
                capIdxs.push(i);
            }
            else if (idUp.startsWith('LED_')) {
                ledIdxs.push(i);
            }
            else if (idUp.startsWith('R_')) {
                resIdxs.push(i);
            }
            else if (idUp.includes('AMMETER')) {
                ammeterIdxs.push(i);
            }
            else if (idUp.includes('VOLTMETER') || idUp.includes('VIRTUAL_METER')) {
                voltmeterIdxs.push(i);
            }
            else if (idUp.includes('OSCILLOSCOPE') || idUp.includes('UART_TERMINAL') ||
                idUp.includes('LOGIC_ANALYZER') || idUp.includes('POWER_METER') ||
                idUp.includes('FREQ_COUNTER')) {
                instrIdxs.push(i);
            }
            else {
                otherIdxs.push(i);
            }
        }
        const cx = CANVAS_W / 2;
        const cy = CANVAS_H / 2;
        if (mcuIdx >= 0) {
            seeds.set(deviceIds[mcuIdx], { x: cx, y: cy, rotate: 0 });
            // 晶振紧邻 MCU 左侧
            if (xtalIdx >= 0) {
                seeds.set(deviceIds[xtalIdx], { x: cx - 110, y: cy - 20, rotate: 0 });
            }
            // 去耦电容在 MCU 右侧/上侧
            for (let ci = 0; ci < capIdxs.length; ci++) {
                seeds.set(deviceIds[capIdxs[ci]], {
                    x: cx + 60 + ci * 30, y: cy - 40, rotate: 0
                });
            }
            // 复位电阻在 MCU 右下
            if (resIdxs.length > 0) {
                seeds.set(deviceIds[resIdxs[0]], {
                    x: cx + 80, y: cy + 60, rotate: 0
                });
                resIdxs.splice(0, 1);
            }
        }
        // LED + 限流电阻配对: 水平排列在右侧区域
        let pairX = mcuIdx >= 0 ? cx + 160 : 200;
        let pairY = mcuIdx >= 0 ? cy - 80 : 100;
        const ledCount = Math.min(ledIdxs.length, resIdxs.length);
        for (let li = 0; li < ledCount; li++) {
            seeds.set(deviceIds[ledIdxs[li]], { x: pairX + 100, y: pairY, rotate: 0 });
            seeds.set(deviceIds[resIdxs[li]], {
                x: pairX, y: pairY, rotate: 0
            });
            pairY += 100;
        }
        // 剩余电阻
        for (let ri = ledCount; ri < resIdxs.length; ri++) {
            seeds.set(deviceIds[resIdxs[ri]], { x: pairX, y: pairY, rotate: 0 });
            pairY += 100;
        }
        // 剩余 LED
        for (let li = ledCount; li < ledIdxs.length; li++) {
            seeds.set(deviceIds[ledIdxs[li]], { x: pairX + 100, y: pairY, rotate: 0 });
            pairY += 100;
        }
        // VCC/GND 靠左
        if (vccIdx >= 0) {
            seeds.set(deviceIds[vccIdx], { x: 60, y: mcuIdx >= 0 ? cy - 80 : 80, rotate: 0 });
        }
        if (gndIdx >= 0) {
            seeds.set(deviceIds[gndIdx], { x: 60, y: mcuIdx >= 0 ? cy + 100 : 180, rotate: 0 });
        }
        // v3.0: 电流表紧邻VCC（串联在电源回路中）— 放在VCC下方
        for (let ai = 0; ai < ammeterIdxs.length; ai++) {
            const vccY = vccIdx >= 0 ? (mcuIdx >= 0 ? cy - 80 : 80) : 80;
            seeds.set(deviceIds[ammeterIdxs[ai]], {
                x: 60, y: vccY + 90 + ai * 100, rotate: 0
            });
        }
        // v3.0: 电压表靠近对应被测电阻 — 每块表放在一个电阻右侧
        for (let vi = 0; vi < voltmeterIdxs.length; vi++) {
            // 分配电压表到对应电阻（循环分配到可用电阻）
            const targetResIdx = vi < resIdxs.length ? resIdxs[vi] :
                resIdxs.length > 0 ? resIdxs[vi % resIdxs.length] : -1;
            if (targetResIdx >= 0) {
                const resSeed = seeds.get(deviceIds[targetResIdx]);
                if (resSeed) {
                    seeds.set(deviceIds[voltmeterIdxs[vi]], {
                        x: resSeed.x + 120, y: resSeed.y, rotate: 0
                    });
                }
                else {
                    seeds.set(deviceIds[voltmeterIdxs[vi]], {
                        x: CANVAS_W - 140, y: 100 + vi * 90, rotate: 0
                    });
                }
            }
            else {
                seeds.set(deviceIds[voltmeterIdxs[vi]], {
                    x: CANVAS_W - 140, y: 100 + vi * 90, rotate: 0
                });
            }
        }
        // 其他仪器靠右列
        for (let ii = 0; ii < instrIdxs.length; ii++) {
            seeds.set(deviceIds[instrIdxs[ii]], {
                x: CANVAS_W - 140, y: 100 + (voltmeterIdxs.length + ii) * 90, rotate: 0
            });
        }
        // 剩余器件网格排列在底部
        for (let oi = 0; oi < otherIdxs.length; oi++) {
            seeds.set(deviceIds[otherIdxs[oi]], {
                x: 200 + (oi % 4) * 130,
                y: CANVAS_H - 120 + Math.floor(oi / 4) * 80,
                rotate: 0
            });
        }
        return seeds;
    }
    private fitness(chrom: Chromosome, deviceIds: string[], idToLib: Map<string, MatchedDevice>, constraints: LayoutLlmOutput): number {
        let score = 0;
        const positions: Gene[] = [];
        for (let i = 0; i < deviceIds.length; i++) {
            const gene = chrom.get(deviceIds[i]);
            if (gene) {
                positions.push(gene);
            }
        }
        score += this.evalAdjacency(chrom, deviceIds, constraints, idToLib) * 0.3;
        score += this.evalModuleIsolation(idToLib, deviceIds, chrom) * 0.2;
        score += this.evalWireLength(deviceIds, chrom) * 0.15;
        score += this.evalHighFreqIsolation(idToLib, deviceIds, chrom) * 0.1;
        score += this.evalInstrumentProximity(idToLib, deviceIds, chrom) * 0.25;
        score -= this.evalOverlap(positions) * 0.5;
        score -= this.evalCrystalKeepout(idToLib, deviceIds, chrom) * 0.3;
        for (let i = 0; i < constraints.constraintRules.length; i++) {
            const rule = constraints.constraintRules[i];
            score += this.evalRule(rule, chrom, deviceIds, idToLib) * (rule.weight / 100);
        }
        return score;
    }
    private evalAdjacency(chrom: Chromosome, ids: string[], constraints: LayoutLlmOutput, idToLib: Map<string, MatchedDevice>): number {
        let s = 0;
        for (let i = 0; i < constraints.constraintRules.length; i++) {
            const rule = constraints.constraintRules[i];
            if (rule.type !== 'adjacent' || !rule.a || !rule.b) {
                continue;
            }
            const ga = this.findGeneByLabel(chrom, ids, rule.a, idToLib);
            const gb = this.findGeneByLabel(chrom, ids, rule.b, idToLib);
            if (!ga || !gb) {
                continue;
            }
            const dist = Math.hypot(ga.x - gb.x, ga.y - gb.y);
            s += Math.max(0, 200 - dist);
        }
        return s;
    }
    private evalModuleIsolation(idToLib: Map<string, MatchedDevice>, ids: string[], chrom: Chromosome): number {
        let penalty = 0;
        const analog: Gene[] = [];
        const digital: Gene[] = [];
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const m = idToLib.get(id);
            if (!m) {
                continue;
            }
            const gene = chrom.get(id);
            if (!gene) {
                continue;
            }
            if (m.moduleZone === 'analog') {
                analog.push(gene);
            }
            else if (m.moduleZone === 'digital_periph') {
                digital.push(gene);
            }
        }
        for (let i = 0; i < analog.length; i++) {
            for (let j = 0; j < digital.length; j++) {
                const dist = Math.hypot(analog[i].x - digital[j].x, analog[i].y - digital[j].y);
                // 模数隔离 ≥150mil (per SKILL.md spec)
                if (dist < 150) {
                    penalty += (150 - dist) * 1.2;
                }
            }
        }
        return Math.max(0, 500 - penalty);
    }
    private evalWireLength(ids: string[], chrom: Chromosome): number {
        if (ids.length < 2) {
            return 100;
        }
        let total = 0;
        for (let i = 1; i < ids.length; i++) {
            const a = chrom.get(ids[i - 1]);
            const b = chrom.get(ids[i]);
            if (a && b) {
                total += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
            }
        }
        return Math.max(0, 2000 - total);
    }
    private evalHighFreqIsolation(idToLib: Map<string, MatchedDevice>, ids: string[], chrom: Chromosome): number {
        let xtal: Gene | null = null;
        let analog: Gene | null = null;
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const m = idToLib.get(id);
            if (!m) {
                continue;
            }
            const gene = chrom.get(id);
            if (!gene) {
                continue;
            }
            if (m.libDevId.includes('XTAL') || m.requirement.devType === 'crystal') {
                xtal = gene;
            }
            if (m.moduleZone === 'analog') {
                analog = gene;
            }
        }
        if (xtal && analog) {
            const dist = Math.hypot(xtal.x - analog.x, xtal.y - analog.y);
            return Math.min(200, dist);
        }
        return 100;
    }
    /** v3.0: 仪器邻近度 — 电流表靠近VCC、电压表靠近被测电阻、示波器靠近信号源 */
    private evalInstrumentProximity(idToLib: Map<string, MatchedDevice>, ids: string[], chrom: Chromosome): number {
        let score = 0;
        // 收集各类型器件位置
        const ammeterGenes: Gene[] = [];
        const voltmeterGenes: Gene[] = [];
        const scopeGenes: Gene[] = [];
        const vccGenes: Gene[] = [];
        const resistorGenes: Gene[] = [];
        const opampGenes: Gene[] = [];
        const mcuGenes: Gene[] = [];
        for (let i = 0; i < ids.length; i++) {
            const m = idToLib.get(ids[i]);
            if (!m)
                continue;
            const gene = chrom.get(ids[i]);
            if (!gene)
                continue;
            const idUp = m.libDevId.toUpperCase();
            if (idUp.includes('AMMETER') || m.requirement.devType === 'ammeter') {
                ammeterGenes.push(gene);
            }
            else if (idUp.includes('VOLTMETER') || idUp.includes('VIRTUAL_METER') ||
                m.requirement.devType === 'voltmeter' || m.requirement.devType === 'multimeter') {
                voltmeterGenes.push(gene);
            }
            else if (idUp.includes('OSCILLOSCOPE') || m.requirement.devType === 'oscilloscope') {
                scopeGenes.push(gene);
            }
            else if (idUp === 'VCC' || m.moduleZone === 'power') {
                vccGenes.push(gene);
            }
            else if (idUp.startsWith('R_')) {
                resistorGenes.push(gene);
            }
            else if (idUp.includes('LM358') || idUp.includes('LM324') || idUp.includes('OP') ||
                m.moduleZone === 'analog') {
                opampGenes.push(gene);
            }
            else if (idUp.includes('STM32') || idUp.includes('AT89') || idUp.includes('STC')) {
                mcuGenes.push(gene);
            }
        }
        // 电流表必须靠近VCC（串联在电源回路中），距离 ≤ 150mil 得满分
        for (let ai = 0; ai < ammeterGenes.length; ai++) {
            let bestDist = Infinity;
            for (let vi = 0; vi < vccGenes.length; vi++) {
                const d = Math.hypot(ammeterGenes[ai].x - vccGenes[vi].x, ammeterGenes[ai].y - vccGenes[vi].y);
                if (d < bestDist)
                    bestDist = d;
            }
            if (bestDist < Infinity) {
                score += Math.max(0, 300 - bestDist * 2); // ≤150mil=满分, >150递减
            }
            // 电流表也应靠近第一电阻（I- 流入负载）
            for (let ri = 0; ri < resistorGenes.length; ri++) {
                const d = Math.hypot(ammeterGenes[ai].x - resistorGenes[ri].x, ammeterGenes[ai].y - resistorGenes[ri].y);
                if (d < 200)
                    score += 50;
            }
        }
        // 电压表靠近被测电阻 — 每块表匹配一个最近电阻
        for (let vi = 0; vi < voltmeterGenes.length; vi++) {
            let bestDist = Infinity;
            for (let ri = 0; ri < resistorGenes.length; ri++) {
                const d = Math.hypot(voltmeterGenes[vi].x - resistorGenes[ri].x, voltmeterGenes[vi].y - resistorGenes[ri].y);
                if (d < bestDist)
                    bestDist = d;
            }
            if (bestDist < Infinity) {
                score += Math.max(0, 250 - bestDist);
            }
            // 电压表远离VCC（测量的是电阻压降，不是电源电压）
            for (let pi = 0; pi < vccGenes.length; pi++) {
                const dVcc = Math.hypot(voltmeterGenes[vi].x - vccGenes[pi].x, voltmeterGenes[vi].y - vccGenes[pi].y);
                if (dVcc < 100)
                    score -= 30; // 太靠近VCC不合适
            }
        }
        // 示波器靠近运放/信号源
        for (let si = 0; si < scopeGenes.length; si++) {
            let bestDist = Infinity;
            const targets = opampGenes.length > 0 ? opampGenes : mcuGenes;
            for (let ti = 0; ti < targets.length; ti++) {
                const d = Math.hypot(scopeGenes[si].x - targets[ti].x, scopeGenes[si].y - targets[ti].y);
                if (d < bestDist)
                    bestDist = d;
            }
            if (bestDist < Infinity) {
                score += Math.max(0, 300 - bestDist);
            }
        }
        // 无仪器时不补偿 → 避免偏置非仪器电路
        // 有仪器但未匹配到目标(如缺少VCC/电阻) → 给基数分避免无限惩罚
        const instrCount = ammeterGenes.length + voltmeterGenes.length + scopeGenes.length;
        if (instrCount > 0 && (vccGenes.length === 0 && resistorGenes.length === 0)) {
            score += 100; // 基数分
        }
        return score;
    }
    /** 晶振禁区: 非晶振/非MCU器件靠近晶振时惩罚 */
    private evalCrystalKeepout(idToLib: Map<string, MatchedDevice>, ids: string[], chrom: Chromosome): number {
        let xtalGene: Gene | null = null;
        for (let i = 0; i < ids.length; i++) {
            const m = idToLib.get(ids[i]);
            if (m && (m.libDevId.includes('XTAL') || m.requirement.devType === 'crystal')) {
                xtalGene = chrom.get(ids[i]) ?? null;
                break;
            }
        }
        if (!xtalGene)
            return 0;
        let penalty = 0;
        for (let i = 0; i < ids.length; i++) {
            const m = idToLib.get(ids[i]);
            if (!m)
                continue;
            const idUp = m.libDevId.toUpperCase();
            // 晶振自身、MCU可紧邻，其余器件必须退开
            if (idUp.includes('XTAL') || idUp.includes('STM32') ||
                idUp.includes('AT89') || idUp.includes('STC')) {
                continue;
            }
            const gene = chrom.get(ids[i]);
            if (!gene)
                continue;
            const dist = Math.hypot(gene.x - xtalGene.x, gene.y - xtalGene.y);
            // 晶振 100mil 内不得有非 MCU 器件
            if (dist < 100) {
                penalty += (100 - dist) * 0.5;
            }
        }
        return penalty;
    }
    private evalOverlap(positions: Gene[]): number {
        let penalty = 0;
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const a = positions[i];
                const b = positions[j];
                // 无库时退回加大固定间距；有库时在 resolveOverlaps 用真实选中区
                if (Math.abs(a.x - b.x) < 220 && Math.abs(a.y - b.y) < 160) {
                    penalty += 100;
                }
            }
        }
        return penalty;
    }
    private evalRule(rule: LayoutConstraintRule, chrom: Chromosome, ids: string[], idToLib: Map<string, MatchedDevice>): number {
        if (rule.type === 'central' && rule.target) {
            const g = this.findGeneByLabel(chrom, ids, rule.target, idToLib);
            if (!g) {
                return 0;
            }
            const cx = CANVAS_W / 2;
            const cy = CANVAS_H / 2;
            return Math.max(0, 300 - Math.hypot(g.x - cx, g.y - cy));
        }
        if (rule.type === 'separate' && rule.minDistance) {
            return 50;
        }
        return 0;
    }
    private findGeneByLabel(chrom: Chromosome, ids: string[], label: string, idToLib: Map<string, MatchedDevice>): Gene | null {
        const upper = label.toUpperCase();
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const m = idToLib.get(id);
            if (!m) {
                continue;
            }
            const libUpper = m.libDevId.toUpperCase();
            const nameUpper = m.name.toUpperCase();
            const typeUpper = m.requirement.devType.toUpperCase();
            if (libUpper.includes(upper) || nameUpper.includes(upper) || typeUpper.includes(upper)) {
                return chrom.get(id) ?? null;
            }
        }
        return null;
    }
    private crossover(p1: Chromosome, p2: Chromosome, ids: string[], locked: Set<string>): Chromosome {
        const child: Chromosome = new Map();
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const source = Math.random() < 0.5 ? p1.get(id) : p2.get(id);
            if (source) {
                const cloned: Gene = { x: source.x, y: source.y, rotate: source.rotate };
                child.set(id, cloned);
            }
        }
        return child;
    }
    private mutate(chrom: Chromosome, ids: string[], locked: Set<string>): void {
        const id = ids[Math.floor(Math.random() * ids.length)];
        if (locked.has(id)) {
            return;
        }
        const mutated: Gene = {
            x: this.snap(Math.random() * (CANVAS_W - 120) + 60),
            y: this.snap(Math.random() * (CANVAS_H - 100) + 40),
            rotate: 0
        };
        chrom.set(id, mutated);
    }
    private buildTopology(matched: MatchedDevice[], chrom: Chromosome, existing?: SchTopology): SchTopology {
        const deviceList: DeviceInst[] = [];
        for (let i = 0; i < matched.length; i++) {
            const m = matched[i];
            const gene = chrom.get(`dev_${i}`)!;
            const refPrefix = m.libDevId.startsWith('R_') ? 'R' :
                m.libDevId.startsWith('C_') ? 'C' :
                    m.libDevId.includes('STM32') || m.libDevId.includes('AT89') ? 'U' : 'U';
            deviceList.push(makeDeviceInst(IdUtil.generate('inst'), m.libDevId, `${refPrefix}${i + 1}`, gene.x, gene.y, 0, // AI 落图强制 0°，保证 Kit 脚几何与真脚布线一致
            m.params));
        }
        const topo: SchTopology = {
            schUuid: existing?.schUuid ?? IdUtil.generate('sch'),
            schName: existing?.schName ?? 'AI Generated',
            layerDepth: existing?.layerDepth ?? 0,
            deviceList,
            netList: existing?.netList ?? [],
            busList: existing?.busList ?? [],
            wireList: [],
            subCircuitList: existing?.subCircuitList ?? [],
            probeList: existing?.probeList ?? [],
            textAnnotate: existing?.textAnnotate ?? [],
            netLabelList: existing?.netLabelList ?? [],
            ercErrorList: [],
            gridStep: GRID,
            bgColor: '#FFFFFF'
        };
        return topo;
    }
    private postProcessAlign(topo: SchTopology, constraints: LayoutLlmOutput): void {
        this.applyMcuHardRules(topo);
        // 无 MCU 时的通用布局规则
        if (!topo.deviceList.some(d => d.libDevId.includes('STM32') || d.libDevId.includes('AT89') ||
            d.libDevId.includes('STC'))) {
            this.applyBasicLayoutRules(topo);
        }
        const groups = getModuleGroupValues(constraints.moduleGroup);
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            if (group.length < 2) {
                continue;
            }
            const devices = topo.deviceList.filter(d => group.some(g => d.libDevId.includes(g) || d.refName.includes(g)));
            if (devices.length < 2) {
                continue;
            }
            const baseY = devices[0].y;
            devices.forEach((d, idx) => {
                d.y = baseY;
                d.x = this.snap(devices[0].x + idx * 100);
            });
        }
        // 重叠消解: 迭代推开所有重叠器件
        this.resolveOverlaps(topo);
    }
    /** 无 MCU 的通用布局: 电源左列、电流表近VCC、电压表近电阻、其他仪器右列、信号器件居中网格 */
    private applyBasicLayoutRules(topo: SchTopology): void {
        const vcc = topo.deviceList.find(d => d.libDevId === 'VCC');
        const gnd = topo.deviceList.find(d => d.libDevId === 'GND');
        // v3.0: 区分电流表与电压表/其他仪器
        const ammeters = topo.deviceList.filter(d => {
            const id = d.libDevId.toUpperCase();
            return id.includes('AMMETER');
        });
        const otherInstruments = topo.deviceList.filter(d => {
            const id = d.libDevId.toUpperCase();
            return (id.includes('OSCILLOSCOPE') || id.includes('VOLTMETER') ||
                id.includes('VIRTUAL_METER') || id.includes('UART_TERMINAL') ||
                id.includes('LOGIC_ANALYZER')) && !id.includes('AMMETER');
        });
        const instruments = [...ammeters, ...otherInstruments];
        const others = topo.deviceList.filter(d => d.libDevId !== 'VCC' && d.libDevId !== 'GND' && !instruments.includes(d));
        if (vcc) {
            vcc.x = this.snap(60);
            vcc.y = this.snap(80);
        }
        if (gnd) {
            gnd.x = this.snap(60);
            gnd.y = this.snap(180);
        }
        // 电流表放在VCC下方（串联在电源回路）
        for (let i = 0; i < ammeters.length; i++) {
            ammeters[i].x = this.snap(60);
            ammeters[i].y = this.snap(170 + i * 100);
        }
        // 电压表尽量靠近对应电阻
        for (let i = 0; i < otherInstruments.length; i++) {
            const inst = otherInstruments[i];
            const idUp = inst.libDevId.toUpperCase();
            if (idUp.includes('VOLTMETER') || idUp.includes('VIRTUAL_METER')) {
                // 在others中找电阻，将电压表放在电阻右侧
                const resistor = others.find(o => o.libDevId.startsWith('R_'));
                if (resistor) {
                    inst.x = this.snap(resistor.x + 120);
                    inst.y = this.snap(resistor.y);
                }
                else {
                    inst.x = this.snap(CANVAS_W - 140);
                    inst.y = this.snap(100 + i * 90);
                }
            }
            else {
                inst.x = this.snap(CANVAS_W - 140);
                inst.y = this.snap(100 + i * 90);
            }
        }
        // 信号器件网格居中
        for (let i = 0; i < others.length; i++) {
            const col = i % 3;
            const row = Math.floor(i / 3);
            others[i].x = this.snap(250 + col * 130);
            others[i].y = this.snap(100 + row * 100);
        }
    }
    /** 迭代消解选中区重叠+通道，最多40轮；优先用真实 HIT_PAD AABB */
    private resolveOverlaps(topo: SchTopology): void {
        const FALLBACK_X = 220;
        const FALLBACK_Y = 160;
        for (let round = 0; round < 40; round++) {
            let moved = false;
            for (let i = 0; i < topo.deviceList.length; i++) {
                for (let j = i + 1; j < topo.deviceList.length; j++) {
                    const a = topo.deviceList[i];
                    const b = topo.deviceList[j];
                    const ra = this.hitRectForInst(a);
                    const rb = this.hitRectForInst(b);
                    if (ra && rb) {
                        // 边到边通道不足 HIT_CHANNEL → 推开
                        const ax1 = ra.x;
                        const ay1 = ra.y;
                        const ax2 = ra.x + ra.w;
                        const ay2 = ra.y + ra.h;
                        const bx1 = rb.x;
                        const by1 = rb.y;
                        const bx2 = rb.x + rb.w;
                        const by2 = rb.y + rb.h;
                        // 正交边间隙：投影不相交为正间隙，相交为负重叠
                        const gapX = (ax2 < bx1) ? (bx1 - ax2) : ((bx2 < ax1) ? (ax1 - bx2) : -(Math.min(ax2, bx2) - Math.max(ax1, bx1)));
                        const gapY = (ay2 < by1) ? (by1 - ay2) : ((by2 < ay1) ? (ay1 - by2) : -(Math.min(ay2, by2) - Math.max(ay1, by1)));
                        const needPush = gapX < HIT_CHANNEL && gapY < HIT_CHANNEL;
                        if (needPush) {
                            const shortfallX = HIT_CHANNEL - gapX;
                            const shortfallY = HIT_CHANNEL - gapY;
                            if (shortfallX <= shortfallY) {
                                const push = Math.ceil(Math.max(shortfallX, GRID) / 2) + GRID;
                                if (a.x <= b.x) {
                                    a.x -= push;
                                    b.x += push;
                                }
                                else {
                                    a.x += push;
                                    b.x -= push;
                                }
                            }
                            else {
                                const push = Math.ceil(Math.max(shortfallY, GRID) / 2) + GRID;
                                if (a.y <= b.y) {
                                    a.y -= push;
                                    b.y += push;
                                }
                                else {
                                    a.y += push;
                                    b.y -= push;
                                }
                            }
                            moved = true;
                        }
                    }
                    else {
                        const overlapX = FALLBACK_X - Math.abs(a.x - b.x);
                        const overlapY = FALLBACK_Y - Math.abs(a.y - b.y);
                        if (overlapX > 0 && overlapY > 0) {
                            if (overlapX < overlapY) {
                                const push = Math.ceil(overlapX / 2) + 5;
                                if (a.x <= b.x) {
                                    a.x -= push;
                                    b.x += push;
                                }
                                else {
                                    a.x += push;
                                    b.x -= push;
                                }
                            }
                            else {
                                const push = Math.ceil(overlapY / 2) + 5;
                                if (a.y <= b.y) {
                                    a.y -= push;
                                    b.y += push;
                                }
                                else {
                                    a.y += push;
                                    b.y -= push;
                                }
                            }
                            moved = true;
                        }
                    }
                    // 钳位到画布内（放宽上限，避免通道推开被夹回重叠）
                    a.x = Math.max(40, Math.min(CANVAS_W - 40, this.snap(a.x)));
                    a.y = Math.max(40, Math.min(CANVAS_H - 40, this.snap(a.y)));
                    b.x = Math.max(40, Math.min(CANVAS_W - 40, this.snap(b.x)));
                    b.y = Math.max(40, Math.min(CANVAS_H - 40, this.snap(b.y)));
                }
            }
            if (!moved) {
                break;
            }
        }
    }
    private hitRectForInst(dev: DeviceInst): WorldHitRect | null {
        if (!this.componentLibrary) {
            return null;
        }
        const r = this.componentLibrary.getComponent(dev.libDevId);
        if (!r.success || !r.data || r.data.pins.length === 0) {
            return null;
        }
        return DeviceHitGeometry.hitRectFromDeviceInst(dev, r.data.pins, SELECTION_HIT_PAD);
    }
    /** 单片机专属硬约束微调 */
    private applyMcuHardRules(topo: SchTopology): void {
        const mcu = topo.deviceList.find(d => d.libDevId.includes('STM32') || d.libDevId.includes('AT89') || d.libDevId.includes('STC'));
        if (!mcu) {
            return;
        }
        mcu.x = this.snap(CANVAS_W / 2);
        mcu.y = this.snap(CANVAS_H / 2);
        const xtal = topo.deviceList.find(d => d.libDevId.includes('XTAL'));
        if (xtal) {
            xtal.x = mcu.x - 100;
            xtal.y = mcu.y - 20;
        }
        const decouplers = topo.deviceList.filter(d => d.libDevId.startsWith('C_') && d.libDevId.includes('100'));
        decouplers.forEach((c, i) => {
            c.x = mcu.x + 60 + i * 30;
            c.y = mcu.y - 40;
        });
        const resetR = topo.deviceList.find(d => d.libDevId.startsWith('R_'));
        if (resetR) {
            resetR.x = mcu.x + 80;
            resetR.y = mcu.y + 60;
        }
        // v3.0: 电流表放在VCC下方（串联在电源回路中）
        const ammeters = topo.deviceList.filter(d => {
            const id = d.libDevId.toUpperCase();
            return id.includes('AMMETER');
        });
        for (let i = 0; i < ammeters.length; i++) {
            ammeters[i].x = this.snap(60);
            ammeters[i].y = this.snap(mcu.y - 140 + i * 100);
            ammeters[i].rotate = 0;
        }
        // 其他仪器靠右外侧排列
        const instruments = topo.deviceList.filter(d => {
            const id = d.libDevId.toUpperCase();
            return (id.includes('OSCILLOSCOPE') || id.includes('VOLTMETER') ||
                id.includes('VIRTUAL_METER') || id.includes('FREQ_COUNTER') || id.includes('UART_TERMINAL') ||
                id.includes('LOGIC_ANALYZER') || id.includes('POWER_METER')) &&
                !id.includes('AMMETER');
        });
        for (let i = 0; i < instruments.length; i++) {
            instruments[i].x = this.snap(CANVAS_W - 140);
            instruments[i].y = this.snap(100 + i * 90);
            instruments[i].rotate = 0;
        }
        // 电源符号靠左
        const vcc = topo.deviceList.find(d => d.libDevId === 'VCC');
        const gnd = topo.deviceList.find(d => d.libDevId === 'GND');
        if (vcc) {
            vcc.x = this.snap(60);
            vcc.y = this.snap(mcu.y - 80);
        }
        if (gnd) {
            gnd.x = this.snap(60);
            gnd.y = this.snap(mcu.y + 100);
        }
        // 晶振禁区: 非MCU/非晶振/非去耦器件须推离晶振区域
        if (xtal) {
            for (const dev of topo.deviceList) {
                if (dev.libDevId === mcu.libDevId || dev.libDevId.includes('XTAL') ||
                    dev.libDevId.includes('100nF') || dev.libDevId.includes('22pF') ||
                    dev.libDevId === 'VCC' || dev.libDevId === 'GND') {
                    continue;
                }
                const dist = Math.hypot(dev.x - xtal.x, dev.y - xtal.y);
                if (dist < 120) {
                    // 沿当前象限方向外推
                    const dx = dev.x - xtal.x;
                    const dy = dev.y - xtal.y;
                    const angle = Math.atan2(dy, dx);
                    dev.x = this.snap(xtal.x + Math.cos(angle) * 140);
                    dev.y = this.snap(xtal.y + Math.sin(angle) * 140);
                }
            }
        }
    }
    private snap(v: number): number {
        return Math.round(v / GRID) * GRID;
    }
}
