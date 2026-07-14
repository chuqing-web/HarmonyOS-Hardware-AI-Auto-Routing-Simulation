export class RandomUtil {
    private static seed: number = Date.now() & 0x7FFFFFFF;
    static setSeed(n49: number): void {
        RandomUtil.seed = n49 & 0x7FFFFFFF;
    }
    static uniform(): number {
        RandomUtil.seed = (RandomUtil.seed * 1103515245 + 12345) & 0x7FFFFFFF;
        return RandomUtil.seed / 0x7FFFFFFF;
    }
    static gaussian(): number {
        let l49 = RandomUtil.uniform();
        let m49 = RandomUtil.uniform();
        if (l49 < 1e-10) {
            l49 = 1e-10;
        }
        return Math.sqrt(-2.0 * Math.log(l49)) * Math.cos(2.0 * Math.PI * m49);
    }
    static gaussianWith(j49: number, k49: number): number {
        return j49 + RandomUtil.gaussian() * k49;
    }
    static sampleWithTolerance(g49: number, h49: number): number {
        const i49 = g49 * (h49 / 100) / 3;
        return RandomUtil.gaussianWith(g49, i49);
    }
}
