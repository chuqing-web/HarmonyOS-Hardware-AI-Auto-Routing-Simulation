import type { ErrCode } from './ErrCode';
export interface DcVoltageScan {
    start: number;
    end: number;
    step: number;
}
export interface SimConfig {
    simMode: 'transient' | 'dc' | 'ac' | 'monte_carlo' | 'noise' | 'mixed';
    transientTotalTime: number;
    minTimeStep: number;
    maxTimeStep: number;
    dcVoltageScan: DcVoltageScan;
    acFreqStart: number;
    acFreqEnd: number;
    acPoints: number;
    monteCarloCount: number;
    enableGpuSpice: boolean;
    freezeIdleSubcircuit: boolean;
    waveSampleInterval: number;
    syncMcuSpicePrecision: 'ns' | 'us' | 'ms';
    mcuClockHz: number;
    temperature: number;
    convergence: number;
}
export interface WaveData {
    waveId: string;
    probeName: string;
    netName: string;
    timeAxis: number[];
    voltageAxis: number[];
    currentAxis: number[];
    sampleRate: number;
    waveType: 'voltage' | 'current' | 'freq' | 'digital';
    holdTime: number;
}
export interface FreqNoiseData {
    frequency: number;
    noiseDb: number;
}
export interface SimStatResult {
    runIndex: number;
    mean: number;
    stdDev: number;
    min?: number;
    max?: number;
    cp?: number;
    cpk?: number;
    waves: WaveData[];
}
export interface SpiceResult {
    errCode: ErrCode;
    nodeVoltages: Map<string, number>;
    branchCurrents: Map<string, number>;
    time: number;
}
export function defaultSimConfig(): SimConfig {
    return {
        simMode: 'mixed',
        // Interactive scope: near-infinite horizon; runBudgetSteps also slides stopTime
        transientTotalTime: 3600.0,
        minTimeStep: 1e-9,
        // 1µs cap + rail-snap shrink → op-amp oscillators looked frozen on scope
        maxTimeStep: 1e-5,
        dcVoltageScan: { start: 0, end: 5, step: 0.1 },
        acFreqStart: 10,
        acFreqEnd: 1e6,
        acPoints: 1000,
        monteCarloCount: 100,
        enableGpuSpice: false,
        freezeIdleSubcircuit: true,
        waveSampleInterval: 1e-7,
        syncMcuSpicePrecision: 'ns',
        mcuClockHz: 11059200,
        temperature: 27,
        convergence: 1e-6
    };
}
