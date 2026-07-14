/**
 * 随机数工具 — Box-Muller 正态分布 + 均匀分布
 */
export class RandomUtil {
  private static seed: number = Date.now() & 0x7FFFFFFF;

  static setSeed(seed: number): void {
    RandomUtil.seed = seed & 0x7FFFFFFF;
  }

  /** 线性同余伪随机 [0, 1) */
  static uniform(): number {
    RandomUtil.seed = (RandomUtil.seed * 1103515245 + 12345) & 0x7FFFFFFF;
    return RandomUtil.seed / 0x7FFFFFFF;
  }

  /** Box-Muller 变换生成标准正态分布 N(0,1) */
  static gaussian(): number {
    let u1 = RandomUtil.uniform();
    let u2 = RandomUtil.uniform();
    if (u1 < 1e-10) {
      u1 = 1e-10;
    }
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /** 指定均值和标准差的正态分布采样 */
  static gaussianWith(mean: number, stdDev: number): number {
    return mean + RandomUtil.gaussian() * stdDev;
  }

  /** 对名义值按百分比容差采样（正态分布，3σ = tolerance） */
  static sampleWithTolerance(nominal: number, tolerancePercent: number): number {
    const stdDev = nominal * (tolerancePercent / 100) / 3;
    return RandomUtil.gaussianWith(nominal, stdDev);
  }
}
