/**
 * GA 布局 Worker — 重叠/散布 + 分区(zone) + 优先级 + 邻接对
 */
import taskpool from '@ohos.taskpool';

export interface GaWorkerInput {
  deviceCount: number;
  popSize: number;
  generations: number;
  canvasW: number;
  canvasH: number;
  grid: number;
  seedGenes: number[];
  /** 0=mcu 1=power 2=crystal 3=instrument 4=other */
  zoneCodes: number[];
  priorities: number[];
  /** 扁平邻接对 [a,b,a,b,...] */
  adjacentPairs: number[];
}

export interface GaWorkerOutput {
  bestGenes: number[];
  bestFitness: number;
}

@Concurrent
function runGaWorker(input: GaWorkerInput): GaWorkerOutput {
  const n = input.deviceCount;
  const geneLen = n * 3;
  const zones = input.zoneCodes.length >= n ? input.zoneCodes : [];
  const pris = input.priorities.length >= n ? input.priorities : [];
  const adj = input.adjacentPairs ?? [];

  let population: number[][] = [];
  for (let i = 0; i < input.popSize; i++) {
    const chrom: number[] = [];
    for (let g = 0; g < geneLen; g++) {
      if (i === 0 && input.seedGenes.length >= geneLen) {
        chrom.push(input.seedGenes[g]);
      } else {
        // 旋转基因强制 0（与 Kit 脚几何一致）
        if (g % 3 === 2) {
          chrom.push(0);
        } else {
          chrom.push(Math.floor(Math.random() * (g % 3 === 0 ? input.canvasW : input.canvasH)));
        }
      }
    }
    // zone 偏置：MCU 靠中、电源左、仪器右
    for (let di = 0; di < n && i > 0; di++) {
      const z = zones.length > di ? zones[di] : 4;
      if (z === 0) {
        chrom[di * 3] = Math.floor(input.canvasW * 0.4 + Math.random() * input.canvasW * 0.2);
        chrom[di * 3 + 1] = Math.floor(input.canvasH * 0.35 + Math.random() * input.canvasH * 0.3);
      } else if (z === 1) {
        chrom[di * 3] = Math.floor(40 + Math.random() * 120);
        chrom[di * 3 + 1] = Math.floor(60 + Math.random() * 200);
      } else if (z === 3) {
        chrom[di * 3] = Math.floor(input.canvasW - 180 + Math.random() * 100);
        chrom[di * 3 + 1] = Math.floor(80 + Math.random() * (input.canvasH - 160));
      } else if (z === 2) {
        chrom[di * 3] = Math.floor(input.canvasW * 0.35 + Math.random() * 80);
        chrom[di * 3 + 1] = Math.floor(input.canvasH * 0.25 + Math.random() * 60);
      }
      chrom[di * 3 + 2] = 0;
    }
    population.push(chrom);
  }

  let best = population[0].slice();
  let bestFit = -Infinity;

  for (let gen = 0; gen < input.generations; gen++) {
    const scored: number[] = [];
    for (let pi = 0; pi < population.length; pi++) {
      const chrom = population[pi];
      let overlap = 0;
      let spread = 0;
      let zoneScore = 0;
      let adjScore = 0;

      for (let si = 0; si < n; si++) {
        const xi = chrom[si * 3];
        const yi = chrom[si * 3 + 1];
        const z = zones.length > si ? zones[si] : 4;
        const pri = pris.length > si ? pris[si] : 30;
        spread += Math.abs(xi - input.canvasW / 2) + Math.abs(yi - input.canvasH / 2);

        // 分区偏好
        if (z === 0) {
          const cx = input.canvasW / 2;
          const cy = input.canvasH / 2;
          zoneScore += Math.max(0, 200 - Math.abs(xi - cx) - Math.abs(yi - cy)) * (pri / 50);
        } else if (z === 1) {
          zoneScore += Math.max(0, 150 - xi) * 0.5;
        } else if (z === 3) {
          zoneScore += Math.max(0, xi - (input.canvasW - 200)) * 0.8;
        } else if (z === 2) {
          zoneScore += Math.max(0, 120 - Math.abs(xi - input.canvasW * 0.4)) * 0.4;
        }

        for (let sj = si + 1; sj < n; sj++) {
          const xj = chrom[sj * 3];
          const yj = chrom[sj * 3 + 1];
          const minSep = input.grid * (zones[si] === 3 || zones[sj] === 3 ? 6 : 4);
          if (Math.abs(xi - xj) < minSep && Math.abs(yi - yj) < minSep) {
            overlap++;
          }
        }
      }

      for (let ai = 0; ai + 1 < adj.length; ai += 2) {
        const a = adj[ai];
        const b = adj[ai + 1];
        if (a < 0 || b < 0 || a >= n || b >= n) {
          continue;
        }
        const dx = chrom[a * 3] - chrom[b * 3];
        const dy = chrom[a * 3 + 1] - chrom[b * 3 + 1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        adjScore += Math.max(0, 180 - dist);
      }

      const fit = 1000 - overlap * 60 - spread * 0.08 + zoneScore * 0.35 + adjScore * 0.5;
      scored.push(fit);
      if (fit > bestFit) {
        bestFit = fit;
        best = population[pi].slice();
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < scored.length; i++) {
      indices.push(i);
    }
    indices.sort((a, b) => scored[b] - scored[a]);

    const next: number[][] = [];
    for (let e = 0; e < 3 && e < indices.length; e++) {
      next.push(population[indices[e]].slice());
    }
    while (next.length < input.popSize) {
      const p1 = population[indices[Math.floor(Math.random() * Math.min(10, indices.length))]];
      const p2 = population[indices[Math.floor(Math.random() * Math.min(10, indices.length))]];
      const child = p1.slice();
      const cross = Math.floor(Math.random() * geneLen);
      for (let c = cross; c < geneLen; c++) {
        child[c] = p2[c];
      }
      const mutRate = gen < input.generations * 0.3 ? 0.25 : 0.05;
      if (Math.random() < mutRate) {
        const gi = Math.floor(Math.random() * geneLen);
        if (gi % 3 === 2) {
          child[gi] = 0;
        } else {
          const maxV = gi % 3 === 0 ? input.canvasW : input.canvasH;
          child[gi] = Math.floor(Math.random() * maxV);
        }
      }
      // 强制旋转为 0
      for (let di = 0; di < n; di++) {
        child[di * 3 + 2] = 0;
      }
      next.push(child);
    }
    population = next;
  }

  // 最终再清旋转，并栅格对齐/钳制到画布
  const g = input.grid > 0 ? input.grid : 20;
  for (let di = 0; di < n; di++) {
    best[di * 3 + 2] = 0;
    let bx = best[di * 3];
    let by = best[di * 3 + 1];
    bx = Math.round(bx / g) * g;
    by = Math.round(by / g) * g;
    if (bx < g) {
      bx = g;
    }
    if (by < g) {
      by = g;
    }
    if (bx > input.canvasW - g) {
      bx = Math.max(g, Math.round((input.canvasW - g) / g) * g);
    }
    if (by > input.canvasH - g) {
      by = Math.max(g, Math.round((input.canvasH - g) / g) * g);
    }
    best[di * 3] = bx;
    best[di * 3 + 1] = by;
  }
  return { bestGenes: best, bestFitness: bestFit };
}

export async function runPlacementGaAsync(input: GaWorkerInput): Promise<GaWorkerOutput> {
  const task = new taskpool.Task(runGaWorker, input);
  try {
    return await taskpool.execute(task) as GaWorkerOutput;
  } catch (_e) {
    return { bestGenes: [], bestFitness: -Infinity };
  }
}
