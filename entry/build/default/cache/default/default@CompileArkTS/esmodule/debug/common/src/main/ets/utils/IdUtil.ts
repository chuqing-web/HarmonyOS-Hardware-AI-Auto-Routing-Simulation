/**
 * 唯一 ID 生成工具
 */
export class IdUtil {
    private static counter: number = 0;
    static generate(prefix: string): string {
        IdUtil.counter++;
        return `${prefix}_${Date.now()}_${IdUtil.counter}`;
    }
}
