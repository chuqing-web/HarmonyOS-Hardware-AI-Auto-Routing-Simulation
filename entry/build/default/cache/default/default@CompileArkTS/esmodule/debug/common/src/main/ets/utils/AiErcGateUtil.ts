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
        if (AiErcGateUtil.isSoftAdvisory(text)) {
            return false;
        }
        // 精确功能阻断词（避免短子串误匹配）
        const keys: string[] = [
            '可能烧毁', 'GPIO可能烧毁', 'LED 缺少限流', '无限流电阻',
            '短路', '同一网络 — 短路', 'I+/I- 在同一网络',
            '完全未连接', '无效器件', '无任何引脚连接',
            '开环（无反馈', '未入网', '未完全连接',
            '标号可能未并网',
            '直连电源', '直连 VCC', '直连 GND',
            '保留电源名', 'Netlist 错误',
            'CH1 未连接', 'GND 未连接 — 必须', 'CH1 与 GND 同网',
            '悬空', '仅有一处连接', '未连接到其他器件',
            '重复网络标号'
        ];
        for (let i = 0; i < keys.length; i++) {
            if (text.indexOf(keys[i]) >= 0) {
                return true;
            }
        }
        const lower = text.toLowerCase();
        if (lower.indexOf('short circuit') >= 0 || lower.indexOf('overcurrent') >= 0) {
            return true;
        }
        return false;
    }
    /** 软性建议：不挡完整生图 / 落图后二次门禁 */
    private static isSoftAdvisory(text: string): boolean {
        const softKeys: string[] = [
            '去耦电容不足',
            '缺少 0.1uF',
            '缺少 100nF',
            '电源入口缺少电解',
            '耐压',
            '余量不足',
            '建议 25V',
            '入口并联',
            '扇出',
            '缺少晶振',
            '负载电容不足',
            '复位电路可能',
            '复位引脚可能',
            '可能缺少去耦',
            '开环比较器',
            '有意开环',
            '电流直通',
            '无负载电阻',
            '恒压无观测',
            '电源/地网络',
            // 勿把「悬空/仅有一处连接/未连接到其他器件」当 soft — 属功能阻断
            '可能不亮',
            '全部测量同一节点',
            '模拟与数字电源',
            'P0 口可能无',
            '基极可能无',
            '功率可能不足',
            '电容耐压',
            '两侧未见电源或负载',
            '振荡可能不起振',
            '运放可能饱和',
            '频率异常',
            '仅 1 个节点'
            // 「重复网络标号」不再一律 soft：模块并行误标可能真断网
        ];
        for (let i = 0; i < softKeys.length; i++) {
            if (text.indexOf(softKeys[i]) >= 0) {
                return true;
            }
        }
        return false;
    }
    /**
     * 模块并行子图：边界脚 joinByLabel 单脚网 / 孤立电源符号 不挡子模块门禁
     */
    static isModularChildExpectedSoft(e: ErcError, boundaryPinKeys: string[], solePinKey: string, soleLibDevId: string): boolean {
        const text = `${e.errType} ${e.desc}`;
        const lower = text.toLowerCase();
        if (lower.indexOf('floating') < 0 && text.indexOf('悬空') < 0 &&
            text.indexOf('仅有一处') < 0 && text.indexOf('未连接到其他器件') < 0) {
            return false;
        }
        if (solePinKey.length > 0) {
            for (let i = 0; i < boundaryPinKeys.length; i++) {
                if (boundaryPinKeys[i] === solePinKey) {
                    return true;
                }
            }
        }
        const libUp = (soleLibDevId ?? '').toUpperCase();
        if ((libUp === 'VCC' || libUp === 'GND' || libUp === 'VEE') &&
            (text.indexOf('电源/地网络') >= 0 || text.indexOf('未连接到其他器件') >= 0 ||
                text.indexOf('仅有一处') >= 0)) {
            return true;
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
