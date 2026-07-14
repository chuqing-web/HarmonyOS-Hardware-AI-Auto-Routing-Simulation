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
function runGaWorker(u293: GaWorkerInput): GaWorkerOutput {
    "use concurrent";
    const v293 = u293.deviceCount;
    const w293 = v293 * 3;
    let x293: number[][] = [];
    for (let b295 = 0; b295 < u293.popSize; b295++) {
        const c295: number[] = [];
        for (let d295 = 0; d295 < w293; d295++) {
            if (b295 === 0 && u293.seedGenes.length >= w293) {
                c295.push(u293.seedGenes[d295]);
            }
            else {
                c295.push(Math.floor(Math.random() * (d295 % 3 === 2 ? 4 : u293.canvasW)));
            }
        }
        x293.push(c295);
    }
    let y293 = x293[0].slice();
    let z293 = -Infinity;
    for (let b294 = 0; b294 < u293.generations; b294++) {
        const c294: number[] = [];
        for (let q294 = 0; q294 < x293.length; q294++) {
            const r294 = x293[q294];
            let s294 = 0;
            let t294 = 0;
            for (let v294 = 0; v294 < v293; v294++) {
                const w294 = r294[v294 * 3];
                const x294 = r294[v294 * 3 + 1];
                t294 += Math.abs(w294 - u293.canvasW / 2) + Math.abs(x294 - u293.canvasH / 2);
                for (let y294 = v294 + 1; y294 < v293; y294++) {
                    const z294 = r294[y294 * 3];
                    const a295 = r294[y294 * 3 + 1];
                    if (Math.abs(w294 - z294) < u293.grid * 4 && Math.abs(x294 - a295) < u293.grid * 4)
                        s294++;
                }
            }
            const u294 = 1000 - s294 * 50 - t294 * 0.1;
            c294.push(u294);
            if (u294 > z293) {
                z293 = u294;
                y293 = x293[q294].slice();
            }
        }
        const d294: number[] = [];
        for (let p294 = 0; p294 < c294.length; p294++)
            d294.push(p294);
        d294.sort((n294, o294) => c294[o294] - c294[n294]);
        const e294: number[][] = [];
        for (let m294 = 0; m294 < 3 && m294 < d294.length; m294++) {
            e294.push(x293[d294[m294]].slice());
        }
        while (e294.length < u293.popSize) {
            const f294 = x293[d294[Math.floor(Math.random() * Math.min(10, d294.length))]];
            const g294 = x293[d294[Math.floor(Math.random() * Math.min(10, d294.length))]];
            const h294 = f294.slice();
            const i294 = Math.floor(Math.random() * w293);
            for (let l294 = i294; l294 < w293; l294++)
                h294[l294] = g294[l294];
            const j294 = b294 < u293.generations * 0.3 ? 0.25 : 0.05;
            if (Math.random() < j294) {
                const k294 = Math.floor(Math.random() * w293);
                h294[k294] = Math.floor(Math.random() * (k294 % 3 === 2 ? 4 : u293.canvasW));
            }
            e294.push(h294);
        }
        x293 = e294;
    }
    const a294: GaWorkerOutput = { bestGenes: y293, bestFitness: z293 };
    return a294;
}
export async function runPlacementGaAsync(r293: GaWorkerInput): Promise<GaWorkerOutput> {
    const s293 = new taskpool.Task(runGaWorker, r293);
    try {
        return await taskpool.execute(s293) as GaWorkerOutput;
    }
    catch (t293) {
        return { bestGenes: [], bestFitness: -Infinity };
    }
}
