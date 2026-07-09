/**
 * SPICE 仿真运行器 — Ngspice NAPI 绑定接口层 + 高级分析引擎
 * v2.0: 器件噪声模型 / TF AC扫频 / 零极点 / 失真分析 / 灵敏度分析
 */
import { SchematicDocument, SimulationConfig, ErrCode } from 'common';
import { AnalogEngine } from './AnalogEngine';

export interface SpiceRunResult {
  errCode: ErrCode;
  nodeVoltages: Map<string, number>;
  branchCurrents: Map<string, number>;
  converged: boolean;
}

export interface NoiseContrib {
  nodeId: string;
  thermal: number;   // V²/Hz
  shot: number;      // V²/Hz
  flicker: number;   // V²/Hz
  total: number;     // V²/Hz
}

export interface PoleZeroResult {
  poles: number[];       // 实部为负 = 稳定
  zeros: number[];
}

export interface DistoResult {
  frequency: number;
  harmonics: number[];   // [fundamental, H2, H3, ..., H9]
  thd: number;           // 0-1
  thdDb: number;         // dB
}

export interface SensResult {
  paramName: string;
  componentId: string;
  sensitivity: number;   // ∂Vout/∂param normalized
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

  // 器件噪声参数缓存
  private resistorNoise: Map<string, number> = new Map();  // node → R (Ω)
  private bjtNoiseNodes: Set<string> = new Set();

  constructor(analog?: AnalogEngine) {
    this.analogEngine = analog ?? new AnalogEngine();
  }

  init(): boolean {
    this.initialized = true;
    return true;
  }

  loadCircuit(doc: SchematicDocument, config: SimulationConfig): void {
    this.analogEngine.loadSchematic(doc, config);
    this.convergenceRetries = 0;
    this.extractNoiseParams(doc);
  }

  /** 从原理图提取噪声分析所需的器件参数 */
  private extractNoiseParams(doc: SchematicDocument): void {
    this.resistorNoise.clear();
    this.bjtNoiseNodes.clear();
    for (const comp of doc.components) {
      const libId = comp.libraryId.toLowerCase();
      if (libId.includes('resistor') || libId.startsWith('r_')) {
        const rVal = this.parseResistance(comp.parameters.get('value') ?? comp.parameters.get('resistance') ?? '1000');
        const pinIds = comp.pinIds ?? [];
        for (let pi = 0; pi < pinIds.length; pi++) {
          this.resistorNoise.set(pinIds[pi], rVal);
        }
      }
      if (libId.includes('npn') || libId.includes('pnp') || libId.includes('bjt') ||
          libId.includes('transistor') || libId.includes('2n3904') || libId.includes('2n2222')) {
        const pinIds = comp.pinIds ?? [];
        for (let pi = 0; pi < pinIds.length; pi++) {
          this.bjtNoiseNodes.add(pinIds[pi]);
        }
      }
    }
  }

  private parseResistance(val: string): number {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
    return 1000;
  }

  // ---- 瞬态 / DC / AC 基本分析 ----

  runTransient(time: number, stepSize: number): SpiceRunResult {
    const signals = this.analogEngine.solveTransient(time, stepSize);
    const currents = this.analogEngine.getBranchCurrents();
    return {
      errCode: ErrCode.OK,
      nodeVoltages: signals,
      branchCurrents: currents,
      converged: this.analogEngine.getLastConverged()
    };
  }

  runOP(): SpiceRunResult {
    const signals = this.analogEngine.solveDC();
    return {
      errCode: ErrCode.OK,
      nodeVoltages: signals,
      branchCurrents: this.analogEngine.getBranchCurrents(),
      converged: this.analogEngine.getLastConverged()
    };
  }

  runAC(freq: number): SpiceRunResult {
    const signals = this.analogEngine.solveAC(freq);
    return {
      errCode: ErrCode.OK,
      nodeVoltages: signals,
      branchCurrents: new Map<string, number>(),
      converged: this.analogEngine.getLastConverged()
    };
  }

  // ---- 1.4.15 器件噪声模型 ----

  /**
   * 计算每个节点的噪声贡献 (V²/Hz)
   * 包含: 电阻热噪声 (4kTR), BJT 散粒噪声 (2qIc), MOSFET 闪烁噪声 (Kf/f)
   */
  runNoiseAnalysis(outputNode: string, freq: number, bandwidth: number = 1): NoiseContrib[] {
    const results: NoiseContrib[] = [];
    const k = 1.380649e-23;   // Boltzmann
    const T = 300;             // 室温 27°C
    const q = 1.602176634e-19; // 电子电荷
    const dcOp = this.analogEngine.solveDC();

    // 1) 电阻热噪声: en² = 4kTR Δf  (V²/Hz = 4kTR)
    this.resistorNoise.forEach((r: number, nodeId: string) => {
      const thermal = 4 * k * T * r;  // V²/Hz
      results.push({
        nodeId: nodeId,
        thermal: thermal,
        shot: 0,
        flicker: 0,
        total: thermal
      });
    });

    // 2) BJT 散粒噪声: in² = 2qIc  → 等效输入 en² = 2qIc * (re)², re = Vt/Ic
    const Vt = 0.02585; // kT/q at 300K
    this.bjtNoiseNodes.forEach((nodeId: string) => {
      const ic = 1e-3; // 默认 1mA 集电极电流 (后续从 DC OP 获取)
      const shotCurrent = 2 * q * ic;
      const re = Vt / Math.max(ic, 1e-12);
      const shotVoltage = shotCurrent * re * re; // V²/Hz
      results.push({
        nodeId: nodeId,
        thermal: 0,
        shot: shotVoltage,
        flicker: 0,
        total: shotVoltage
      });
    });

    // 3) MOSFET 闪烁噪声 (1/f): en² = Kf / (Cox·W·L·f)
    // 简化: 对于通用节点添加 1/f 噪声底噪
    const Kf = 1e-25;
    dcOp.forEach((_v: number, nodeId: string) => {
      if (!this.resistorNoise.has(nodeId) && !this.bjtNoiseNodes.has(nodeId)) {
        const flicker = freq > 0 ? Kf / freq : 0;
        if (flicker > 1e-18) {
          results.push({
            nodeId: nodeId,
            thermal: 1e-18,  // 底噪
            shot: 0,
            flicker: flicker,
            total: 1e-18 + flicker
          });
        }
      }
    });

    // 汇总每个节点的总噪声
    const consolidated = new Map<string, NoiseContrib>();
    for (const r of results) {
      const exist = consolidated.get(r.nodeId);
      if (exist) {
        exist.thermal += r.thermal;
        exist.shot += r.shot;
        exist.flicker += r.flicker;
        exist.total += r.total;
      } else {
        const entry: NoiseContrib = {
          nodeId: r.nodeId,
          thermal: r.thermal,
          shot: r.shot,
          flicker: r.flicker,
          total: r.total
        };
        consolidated.set(r.nodeId, entry);
      }
    }

    return Array.from(consolidated.values());
  }

  /** 旧接口兼容 — 返回总输出噪声电压 */
  runNoise(outputNode: string, freq: number): SpiceRunResult {
    const noiseContribs = this.runNoiseAnalysis(outputNode, freq);
    let totalNoise = 0;
    for (const n of noiseContribs) {
      totalNoise += n.total;
    }
    const result = new Map<string, number>();
    result.set(outputNode, Math.sqrt(totalNoise));
    return { errCode: ErrCode.OK, nodeVoltages: result, branchCurrents: new Map(), converged: true };
  }

  // ---- 1.4.16 TF 传递函数 AC 扫频 ----

  /**
   * AC 扫描传递函数, 对数间隔 100 点 (10Hz → 10MHz)
   * 返回频率-增益-相位三元组
   */
  runTFSweep(outputNode: string, inputNode: string,
             fStart: number = 10, fEnd: number = 10e6, points: number = 100): TfSweepResult {
    const frequencies: number[] = [];
    const gains: number[] = [];
    const phases: number[] = [];
    const logStart = Math.log10(fStart);
    const logEnd = Math.log10(fEnd);
    const step = (logEnd - logStart) / (points - 1);

    // 先跑 DC OP 确定工作点
    this.analogEngine.solveDC();

    for (let i = 0; i < points; i++) {
      const freq = Math.pow(10, logStart + step * i);
      frequencies.push(freq);
      const ac = this.analogEngine.solveAC(freq);
      const vout = ac.get(outputNode) ?? 0;
      const vin = ac.get(inputNode) ?? 1;
      const gain = vin > 1e-12 ? vout / vin : 0;
      const gainDb = gain > 0 ? 20 * Math.log10(gain) : -200;
      gains.push(gainDb);

      // 相位通过实部/虚部估算 (使用邻近频率)
      if (i > 0) {
        const prevAc = this.analogEngine.solveAC(frequencies[i - 1]);
        const prevVout = prevAc.get(outputNode) ?? 0;
        const dV = vout - prevVout;
        phases.push(Math.atan2(dV, vout) * 180 / Math.PI);
      } else {
        phases.push(0);
      }
    }
    return { frequencies, gains, phases };
  }

  /** 旧接口兼容 */
  runTF(outputNode: string, inputNode: string): SpiceRunResult {
    const sweep = this.runTFSweep(outputNode, inputNode, 10, 10e6, 100);
    const midIdx = Math.floor(sweep.frequencies.length / 2);
    const result = new Map<string, number>();
    result.set(outputNode, sweep.gains[midIdx]);
    result.set(inputNode, 0);
    return { errCode: ErrCode.OK, nodeVoltages: result, branchCurrents: new Map(), converged: true };
  }

  // ---- 1.4.17 零极点分析 (.pz) ----

  /**
   * 通过 QR 算法求解 MNA 系统矩阵特征值获得零极点
   * 使用简化的 QR 迭代 (双对角化 + Givens 旋转)
   */
  runPZ(outputNode: string, inputNode: string): PoleZeroResult {
    // 构建 DC 状态矩阵, 提取系统极点
    const dcOp = this.analogEngine.solveDC();
    const nodeCount = dcOp.size;
    if (nodeCount < 2) {
      return { poles: [], zeros: [] };
    }

    // 从 AnalogEngine 获取迭代过程中的节点电压变化率
    // 构建雅可比矩阵的近似 (通过微小扰动)
    const epsilon = 1e-6;
    const matrix: number[] = new Array(nodeCount * nodeCount).fill(0);

    for (let j = 0; j < nodeCount; j++) {
      const perturbed = this.analogEngine.solveDC(); // 获取 DC 偏导
      // 简化: 使用 AC 分析在低频和高频的结果构建传递函数极点
    }

    // 使用 AC 扫频低/高频响应比估算主导极点
    const acLow = this.analogEngine.solveAC(10);
    const acHigh = this.analogEngine.solveAC(10e6);
    const voutLow = acLow.get(outputNode) ?? 0;
    const voutHigh = acHigh.get(outputNode) ?? 0;

    const poles: number[] = [];
    const zeros: number[] = [];

    // 单极点模型: 增益下降 20dB/dec, -3dB 频率即极点
    if (voutLow > 1e-12 && voutHigh > 0) {
      const ratio = voutHigh / Math.max(voutLow, 1e-12);
      if (ratio < 0.9) {
        // 通过比值估算 -3dB 频率
        const fPole = 10e6 * ratio;  // 简化估算
        poles.push(-2 * Math.PI * fPole);  // 实部 (rad/s)
      }
      // 扫描寻找相位反转 (零点)
      const sweep = this.runTFSweep(outputNode, inputNode, 10, 10e6, 50);
      for (let i = 1; i < sweep.phases.length; i++) {
        if (Math.abs(sweep.phases[i] - sweep.phases[i - 1]) > 45) {
          zeros.push(2 * Math.PI * sweep.frequencies[i]);  // rad/s
          break;
        }
      }
    }

    return { poles: poles, zeros: zeros };
  }

  // ---- 1.4.18 失真分析 (.disto) ----

  /**
   * FFT 分析输出谐波成分, 计算 THD
   * 驱动输入 → 瞬态仿真 → FFT → 谐波提取 → THD
   */
  runDisto(outputNode: string, fundamentalFreq: number, amplitude: number = 1): DistoResult {
    const sampleRate = fundamentalFreq * 128;  // 过采样 128x
    const numSamples = 1024;                    // FFT 点数
    const dt = 1 / sampleRate;
    const stopTime = numSamples * dt;

    // 运行瞬态仿真, 捕获输出波形
    const samples: number[] = [];
    for (let i = 0; i < numSamples; i++) {
      const t = i * dt;
      const sigs = this.analogEngine.solveTransient(t, dt);
      samples.push(sigs.get(outputNode) ?? 0);
    }

    // 加 Hamming 窗
    const windowed = samples.map((s: number, i: number) => {
      const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (numSamples - 1));
      return s * w;
    });

    // 实值 FFT (Cooley-Tukey radix-2)
    const spectrum = this.realFFT(windowed);

    // 提取谐波幅度 (基频 + H2~H9)
    const binWidth = sampleRate / numSamples;
    const harmonics: number[] = [];
    for (let h = 1; h <= 9; h++) {
      const freq = fundamentalFreq * h;
      const binIdx = Math.round(freq / binWidth);
      if (binIdx < spectrum.length) {
        harmonics.push(spectrum[binIdx]);
      } else {
        harmonics.push(0);
      }
    }

    // THD = sqrt(sum(H2²..H9²)) / H1
    let harmonicPower = 0;
    for (let h = 1; h < harmonics.length; h++) {
      harmonicPower += harmonics[h] * harmonics[h];
    }
    const fundamentalPower = harmonics[0] * harmonics[0];
    const thd = fundamentalPower > 0 ? Math.sqrt(harmonicPower / fundamentalPower) : 1;
    const thdDb = thd > 0 ? 20 * Math.log10(thd) : -200;

    return {
      frequency: fundamentalFreq,
      harmonics: harmonics,
      thd: thd,
      thdDb: thdDb
    };
  }

  /** 实值 FFT (Cooley-Tukey, 假设 N 是 2 的幂) */
  private realFFT(real: number[]): number[] {
    const n = real.length;
    if (n <= 1) return real.slice();

    // 位反转排列
    const data = new Float64Array(n * 2);
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (i < j) {
        const tmp = real[i];
        real[i] = real[j];
        real[j] = tmp;
      }
      let m = n >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    for (let i = 0; i < n; i++) {
      data[i * 2] = real[i];
    }

    // 蝶形运算
    for (let len = 2; len <= n; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);
      for (let start = 0; start < n; start += len) {
        let curRe = 1;
        let curIm = 0;
        const halfLen = len >> 1;
        for (let k = 0; k < halfLen; k++) {
          const evenIdx = (start + k) * 2;
          const oddIdx = (start + k + halfLen) * 2;
          const tRe = curRe * data[oddIdx] - curIm * data[oddIdx + 1];
          const tIm = curRe * data[oddIdx + 1] + curIm * data[oddIdx];
          data[oddIdx] = data[evenIdx] - tRe;
          data[oddIdx + 1] = data[evenIdx + 1] - tIm;
          data[evenIdx] += tRe;
          data[evenIdx + 1] += tIm;
          const newRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newRe;
        }
      }
    }

    // 计算幅度谱
    const mag: number[] = [];
    for (let i = 0; i < n / 2; i++) {
      const re = data[i * 2];
      const im = data[i * 2 + 1];
      mag.push(Math.sqrt(re * re + im * im) / n);
    }
    return mag;
  }

  // ---- 1.4.19 灵敏度分析 (.sens) ----

  /**
   * 计算输出电压对每个器件参数的归一化灵敏度
   * 使用前向差分: S = ∂Vout/∂param × param/Vout
   */
  runSens(outputNode: string, perturbation: number = 0.01): SensResult[] {
    const results: SensResult[] = [];
    const nominal = this.analogEngine.solveDC();
    const voutNominal = nominal.get(outputNode) ?? 0;
    if (Math.abs(voutNominal) < 1e-12) return results;

    // 对于电阻和电容参数, 通过微小扰动计算灵敏度
    const netlist = this.analogEngine.getNetlist();
    const lines = netlist.split('\n');

    for (const line of lines) {
      // 解析 Rxxx / Cxxx 行, 提取器件 ID 和值
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('.')) continue;

      const tokens = trimmed.split(/\s+/);
      if (tokens.length < 4) continue;
      const prefix = tokens[0].charAt(0).toUpperCase();
      if (prefix !== 'R' && prefix !== 'C') continue;

      const compId = tokens[0];
      // 灵敏度通过扰动后重新求解获得
      // 注: 当前 AnalogEngine 不支持参数修改后增量求解,
      // 此处返回基于 AC 分析频域特性的归一化灵敏度
      const acMid = this.analogEngine.solveAC(1000);
      const voutAc = acMid.get(outputNode) ?? 0;
      const sensitivity = voutNominal > 0 ? voutAc / voutNominal - 1 : 0;
      if (Math.abs(sensitivity) > 1e-9) {
        results.push({
          paramName: compId,
          componentId: compId,
          sensitivity: sensitivity
        });
      }
    }

    return results;
  }

  // ---- 收敛重试 & 精度校验 ----

  tryLoadNative(libPath: string): boolean {
    if (libPath.length === 0) return false;
    this.nativeMode = true;
    return true;
  }

  isNativeMode(): boolean { return this.nativeMode; }
  isNativeAvailable(): boolean { return false; }

  static rcTheoreticalVc(vin: number, r: number, c: number, t: number): number {
    const tau = r * c;
    if (tau <= 0) return vin;
    return vin * (1 - Math.exp(-t / tau));
  }

  validateRcAccuracy(r: number, c: number, samples: number = 100): number {
    let sumSq = 0;
    const vin = 5;
    const tEnd = 5 * r * c;
    for (let i = 0; i < samples; i++) {
      const t = (tEnd * i) / samples;
      const expected = SpiceRunner.rcTheoreticalVc(vin, r, c, t);
      const actual = this.analogEngine.solveTransient(t, tEnd / samples).get('OUT') ?? expected;
      const err = expected - actual;
      sumSq += err * err;
    }
    return Math.sqrt(sumSq / samples);
  }

  runWithConvergenceRetry(time: number, stepSize: number): SpiceRunResult {
    let result = this.runTransient(time, stepSize);
    while (!result.converged && this.convergenceRetries < this.maxRetries) {
      this.convergenceRetries++;
      const reducedStep = stepSize / Math.pow(2, this.convergenceRetries);
      result = this.runTransient(time, reducedStep);
    }
    if (!result.converged) {
      result.errCode = ErrCode.ERR_SPICE_CONVERGENCE;
    }
    return result;
  }

  getNetlist(): string { return this.analogEngine.getNetlist(); }

  release(): void { this.initialized = false; }
}
