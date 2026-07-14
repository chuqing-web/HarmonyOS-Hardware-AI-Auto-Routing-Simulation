import taskpool from "@ohos:taskpool";
export interface GaWorkerInput {
    deviceCount: number;
    popSize: number;
    generations: number;
    canvasW: number;
    canvasH: number;
    grid: number;
    seedGenes: number[];
}
export interface GaWorkerOutput {
    bestGenes: number[];
    bestFitness: number;
}
function runGaWorker(input: GaWorkerInput): GaWorkerOutput {
    "use concurrent";
    const n = input.deviceCount;
    const geneLen = n * 3;
    let population: number[][] = [];
    for (let i = 0; i < input.popSize; i++) {
        const chrom: number[] = [];
        for (let g = 0; g < geneLen; g++) {
            if (i === 0 && input.seedGenes.length >= geneLen) {
                chrom.push(input.seedGenes[g]);
            }
            else {
                chrom.push(Math.floor(Math.random() * (g % 3 === 2 ? 4 : input.canvasW)));
            }
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
            for (let si = 0; si < n; si++) {
                const xi = chrom[si * 3];
                const yi = chrom[si * 3 + 1];
                spread += Math.abs(xi - input.canvasW / 2) + Math.abs(yi - input.canvasH / 2);
                for (let sj = si + 1; sj < n; sj++) {
                    const xj = chrom[sj * 3];
                    const yj = chrom[sj * 3 + 1];
                    if (Math.abs(xi - xj) < input.grid * 4 && Math.abs(yi - yj) < input.grid * 4)
                        overlap++;
                }
            }
            const fit = 1000 - overlap * 50 - spread * 0.1;
            scored.push(fit);
            if (fit > bestFit) {
                bestFit = fit;
                best = population[pi].slice();
            }
        }
        const indices: number[] = [];
        for (let i = 0; i < scored.length; i++)
            indices.push(i);
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
            for (let c = cross; c < geneLen; c++)
                child[c] = p2[c];
            const mutRate = gen < input.generations * 0.3 ? 0.25 : 0.05;
            if (Math.random() < mutRate) {
                const gi = Math.floor(Math.random() * geneLen);
                child[gi] = Math.floor(Math.random() * (gi % 3 === 2 ? 4 : input.canvasW));
            }
            next.push(child);
        }
        population = next;
    }
    const result: GaWorkerOutput = { bestGenes: best, bestFitness: bestFit };
    return result;
}
export async function runPlacementGaAsync(input: GaWorkerInput): Promise<GaWorkerOutput> {
    const task = new taskpool.Task(runGaWorker, input);
    try {
        return await taskpool.execute(task) as GaWorkerOutput;
    }
    catch (_e) {
        return { bestGenes: [], bestFitness: -Infinity };
    }
}
