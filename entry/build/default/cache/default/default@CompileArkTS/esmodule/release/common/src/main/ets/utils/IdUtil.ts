export class IdUtil {
    private static counter: number = 0;
    static generate(c25: string): string {
        IdUtil.counter++;
        return `${c25}_${Date.now()}_${IdUtil.counter}`;
    }
}
