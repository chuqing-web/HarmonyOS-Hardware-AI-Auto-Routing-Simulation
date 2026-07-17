import type { ErcError } from '../types/TopologyTypes';
export class AiErcGateUtil {
    /** 是否挡住「生图完整」门禁 */
    static isBlocking(e: ErcError): boolean {
        const s = e.severity;
        if (s === 'error' || s === 'critical') {
            return true;
        }
        if (s === 'info') {
            return false;
        }
        if (s !== 'warning') {
            return false;
        }
        return AiErcGateUtil.isFunctionalImpactWarning(e);
    }
    /** 严重影响电路能否按用户需求工作的 warning */
    static isFunctionalImpactWarning(e: ErcError): boolean {
        const text = `${e.errType} ${e.desc} ${e.suggest}`;
        const soft = AiErcGateUtil.isSoftAdvisory(text);
        if (soft) {
            return false;
        }
        // 连通 / 安全 / 仪器拓扑 / 关键拓扑 —— 直接影响功能
        const keys: string[] = [
            '不亮', '烧毁', '短路', '未连接', '浮空', '开环', '无反馈',
            '无任何引脚', '缺少限流', '未入网', '完全未连接', '无效器件',
            '未完全连接', '未串联', '电流未流经', '同一节点', '同一网络',
            '直连电源', '直连 VCC', '直连 GND', 'GPIO可能烧毁', '可能烧毁',
            '可能不亮', '可能开环', 'I+ 未接', 'I- 未接', '扇出过载',
            '信号网络', '保留电源名', 'Netlist', '互斥', '触点', 'NC', 'NO'
        ];
        for (let i = 0; i < keys.length; i++) {
            if (text.indexOf(keys[i]) >= 0) {
                return true;
            }
        }
        // 英文/规则类型兜底
        const lower = text.toLowerCase();
        if (lower.indexOf('unconnected') >= 0 || lower.indexOf('short') >= 0 ||
            lower.indexOf('floating') >= 0 || lower.indexOf('overcurrent') >= 0) {
            return true;
        }
        return false;
    }
    /** 软性建议：不挡完整生图 */
    private static isSoftAdvisory(text: string): boolean {
        const softKeys: string[] = [
            '去耦电容不足',
            '电源入口缺少电解',
            '耐压',
            '余量不足',
            '建议 25V',
            '入口并联'
        ];
        for (let i = 0; i < softKeys.length; i++) {
            if (text.indexOf(softKeys[i]) >= 0) {
                return true;
            }
        }
        return false;
    }
    static filterBlocking(list: ErcError[]): ErcError[] {
        const out: ErcError[] = [];
        for (let i = 0; i < list.length; i++) {
            if (AiErcGateUtil.isBlocking(list[i])) {
                out.push(list[i]);
            }
        }
        return out;
    }
    static countBlocking(list: ErcError[]): number {
        return AiErcGateUtil.filterBlocking(list).length;
    }
    static summarizeBlocking(list: ErcError[], maxItems: number = 4): string {
        const hard = AiErcGateUtil.filterBlocking(list);
        const n = Math.min(hard.length, maxItems);
        const bits: string[] = [];
        for (let i = 0; i < n; i++) {
            bits.push(hard[i].desc);
        }
        return bits.join('; ');
    }
}
