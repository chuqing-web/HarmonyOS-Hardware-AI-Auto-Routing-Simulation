/**
 * 遗传算法布局优化器 — LLM 约束 + 本地坐标迭代
 */
import {
  SchTopology, DeviceInst, LayoutLlmOutput, LayoutConstraintRule,
  MatchedDevice, PlacementCandidate, PlacementResult, IdUtil,
  makeDeviceInst
} from 'common';
import {
  getModuleGroupLists, moduleGroupToRecord, positionsFromChromosome,
  positionsToRecord, getModuleGroupValues
} from '../internal/AiEngineHelpers';
import { runPlacementGaAsync, GaWorkerInput } from './PlacementGaWorker';

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
  optimize(
    matched: MatchedDevice[],
    constraints: LayoutLlmOutput,
    lockedUuids: string[] = [],
    existingTopo?: SchTopology
  ): PlacementResult {
    const deviceIds = matched.map((_, i) => `dev_${i}`);
    const idToLib = new Map<string, MatchedDevice>();
    deviceIds.forEach((id, i) => idToLib.set(id, matched[i]));

    const locked = new Set(lockedUuids);
    let population = this.initPopulation(deviceIds, locked, existingTopo);

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
  async optimizeAsync(
    matched: MatchedDevice[],
    constraints: LayoutLlmOutput,
    lockedUuids: string[] = [],
    existingTopo?: SchTopology
  ): Promise<PlacementResult> {
    if (matched.length < 4) {
      return this.optimize(matched, constraints, lockedUuids, existingTopo);
    }
    try {
      const deviceIds = matched.map((_: MatchedDevice, i: number) => `dev_${i}`);
      const seedGenes: number[] = [];
      for (let i = 0; i < deviceIds.length; i++) {
        const dev = existingTopo?.deviceList[i];
        seedGenes.push(dev?.x ?? 100 + i * 40, dev?.y ?? 100, dev?.rotate ?? 0);
      }
      const input: GaWorkerInput = {
        deviceCount: matched.length,
        popSize: POP_SIZE,
        generations: GENERATIONS,
        canvasW: CANVAS_W,
        canvasH: CANVAS_H,
        grid: GRID,
        seedGenes: seedGenes
      };
      const workerOut = await runPlacementGaAsync(input);
      const chrom: Chromosome = new Map();
      for (let i = 0; i < deviceIds.length; i++) {
        const gene: Gene = {
          x: this.snap(workerOut.bestGenes[i * 3]),
          y: this.snap(workerOut.bestGenes[i * 3 + 1]),
          rotate: workerOut.bestGenes[i * 3 + 2]
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
    } catch (_e) {
      return this.optimize(matched, constraints, lockedUuids, existingTopo);
    }
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
      } else if (m.moduleZone === 'power') {
        moduleGroup.power.push(label);
      } else {
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
      type: 'separate', a: 'power', b: 'analog', minDistance: 150, weight: 80
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

  private initPopulation(deviceIds: string[], locked: Set<string>,
    existing?: SchTopology): Chromosome[] {
    const pop: Chromosome[] = [];
    for (let i = 0; i < POP_SIZE; i++) {
      const chrom: Chromosome = new Map();
      for (let j = 0; j < deviceIds.length; j++) {
        const id = deviceIds[j];
        const existingDev = existing?.deviceList[j];
        if (locked.has(existingDev?.instUuid ?? '')) {
          const lockedGene: Gene = {
            x: existingDev!.x,
            y: existingDev!.y,
            rotate: existingDev!.rotate
          };
          chrom.set(id, lockedGene);
        } else {
          const randGene: Gene = {
            x: this.snap(100 + (j % 5) * 120 + Math.random() * 40),
            y: this.snap(80 + Math.floor(j / 5) * 100 + Math.random() * 40),
            rotate: [0, 0, 0, 90][Math.floor(Math.random() * 4)]
          };
          chrom.set(id, randGene);
        }
      }
      pop.push(chrom);
    }
    return pop;
  }

  private fitness(
    chrom: Chromosome,
    deviceIds: string[],
    idToLib: Map<string, MatchedDevice>,
    constraints: LayoutLlmOutput
  ): number {
    let score = 0;
    const positions: Gene[] = [];
    for (let i = 0; i < deviceIds.length; i++) {
      const gene = chrom.get(deviceIds[i]);
      if (gene) {
        positions.push(gene);
      }
    }

    score += this.evalAdjacency(chrom, deviceIds, constraints, idToLib) * 0.4;
    score += this.evalModuleIsolation(idToLib, deviceIds, chrom) * 0.25;
    score += this.evalWireLength(deviceIds, chrom) * 0.2;
    score += this.evalHighFreqIsolation(idToLib, deviceIds, chrom) * 0.15;
    score -= this.evalOverlap(positions) * 0.5;

    for (let i = 0; i < constraints.constraintRules.length; i++) {
      const rule = constraints.constraintRules[i];
      score += this.evalRule(rule, chrom, deviceIds, idToLib) * (rule.weight / 100);
    }

    return score;
  }

  private evalAdjacency(chrom: Chromosome, ids: string[],
    constraints: LayoutLlmOutput, idToLib: Map<string, MatchedDevice>): number {
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

  private evalModuleIsolation(idToLib: Map<string, MatchedDevice>, ids: string[],
    chrom: Chromosome): number {
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
      } else if (m.moduleZone === 'digital_periph') {
        digital.push(gene);
      }
    }
    for (let i = 0; i < analog.length; i++) {
      for (let j = 0; j < digital.length; j++) {
        const dist = Math.hypot(analog[i].x - digital[j].x, analog[i].y - digital[j].y);
        if (dist < 100) {
          penalty += (100 - dist);
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

  private evalHighFreqIsolation(idToLib: Map<string, MatchedDevice>, ids: string[],
    chrom: Chromosome): number {
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

  private evalOverlap(positions: Gene[]): number {
    let penalty = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        if (Math.abs(a.x - b.x) < 80 && Math.abs(a.y - b.y) < 50) {
          penalty += 100;
        }
      }
    }
    return penalty;
  }

  private evalRule(rule: LayoutConstraintRule, chrom: Chromosome,
    ids: string[], idToLib: Map<string, MatchedDevice>): number {
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

  private findGeneByLabel(chrom: Chromosome, ids: string[], label: string,
    idToLib: Map<string, MatchedDevice>): Gene | null {
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

  private crossover(p1: Chromosome, p2: Chromosome,
    ids: string[], locked: Set<string>): Chromosome {
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
    const mutated: Gene = {
      x: this.snap(Math.random() * (CANVAS_W - 120) + 60),
      y: this.snap(Math.random() * (CANVAS_H - 100) + 40),
      rotate: [0, 90, 180, 270][Math.floor(Math.random() * 4)]
    };
    chrom.set(id, mutated);
  }

  private buildTopology(matched: MatchedDevice[], chrom: Chromosome,
    existing?: SchTopology): SchTopology {
    const deviceList: DeviceInst[] = [];
    for (let i = 0; i < matched.length; i++) {
      const m = matched[i];
      const gene = chrom.get(`dev_${i}`)!;
      const refPrefix = m.libDevId.startsWith('R_') ? 'R' :
        m.libDevId.startsWith('C_') ? 'C' :
          m.libDevId.includes('STM32') || m.libDevId.includes('AT89') ? 'U' : 'U';
      deviceList.push(makeDeviceInst(
        IdUtil.generate('inst'),
        m.libDevId,
        `${refPrefix}${i + 1}`,
        gene.x,
        gene.y,
        gene.rotate,
        m.params
      ));
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
      ercErrorList: [],
      gridStep: GRID,
      bgColor: '#FFFFFF'
    };
    return topo;
  }

  private postProcessAlign(topo: SchTopology, constraints: LayoutLlmOutput): void {
    this.applyMcuHardRules(topo);
    const groups = getModuleGroupValues(constraints.moduleGroup);
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.length < 2) {
        continue;
      }
      const devices = topo.deviceList.filter(d =>
        group.some(g => d.libDevId.includes(g) || d.refName.includes(g)));
      if (devices.length < 2) {
        continue;
      }
      const baseY = devices[0].y;
      devices.forEach((d, idx) => {
        d.y = baseY;
        d.x = this.snap(devices[0].x + idx * 100);
      });
    }
  }

  /** 单片机专属硬约束微调 */
  private applyMcuHardRules(topo: SchTopology): void {
    const mcu = topo.deviceList.find(d =>
      d.libDevId.includes('STM32') || d.libDevId.includes('AT89') || d.libDevId.includes('STC'));
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

    const decouplers = topo.deviceList.filter(d =>
      d.libDevId.startsWith('C_') && d.libDevId.includes('100'));
    decouplers.forEach((c, i) => {
      c.x = mcu.x + 60 + i * 30;
      c.y = mcu.y - 40;
    });

    const resetR = topo.deviceList.find(d => d.libDevId.startsWith('R_'));
    if (resetR) {
      resetR.x = mcu.x + 80;
      resetR.y = mcu.y + 60;
    }
  }

  private snap(v: number): number {
    return Math.round(v / GRID) * GRID;
  }
}
