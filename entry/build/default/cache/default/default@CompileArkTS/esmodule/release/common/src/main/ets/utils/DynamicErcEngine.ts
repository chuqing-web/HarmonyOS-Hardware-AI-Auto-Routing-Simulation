import type { WaveData } from '../types/SimExtendedTypes';
import { ErcSeverity, ErcRuleType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { ErcViolation } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { arrayMin, arrayMax } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
export class DynamicErcEngine {
    static analyze(k18: WaveData[], l18: Map<string, string>): ErcViolation[] {
        const m18: ErcViolation[] = [];
        for (let p18 = 0; p18 < k18.length; p18++) {
            const q18 = k18[p18];
            if (q18.voltageAxis.length < 2) {
                continue;
            }
            const r18 = arrayMin(q18.voltageAxis);
            const s18 = arrayMax(q18.voltageAxis);
            let t18 = 0;
            for (let x18 = 0; x18 < q18.voltageAxis.length; x18++) {
                t18 += q18.voltageAxis[x18];
            }
            const u18 = t18 / q18.voltageAxis.length;
            if (s18 > 5.5) {
                m18.push(DynamicErcEngine.violation(ErcSeverity.ERROR, `持续过压: ${q18.probeName} 峰值 ${s18.toFixed(2)}V`, q18.netName, '检查电源电压或添加限压保护'));
            }
            if (Math.abs(u18) > 4.5 && q18.waveType === 'voltage') {
                m18.push(DynamicErcEngine.violation(ErcSeverity.WARNING, `运放可能饱和: ${q18.probeName} 平均 ${u18.toFixed(2)}V`, q18.netName, '调整增益或偏置'));
            }
            if (s18 - r18 < 0.01 && s18 > 0.1) {
                m18.push(DynamicErcEngine.violation(ErcSeverity.WARNING, `振荡可能不起振: ${q18.probeName} 幅度过小`, q18.netName, '检查晶振参数与负载电容'));
            }
            if (q18.timeAxis.length >= 4) {
                const w18 = DynamicErcEngine.estimateFrequency(q18);
                if (w18 > 0 && w18 < 10) {
                    m18.push(DynamicErcEngine.violation(ErcSeverity.WARNING, `频率异常偏低: ${q18.probeName} ≈ ${w18.toFixed(1)}Hz`, q18.netName, '检查时钟源或 RC 时间常数'));
                }
                if (w18 > 50e6) {
                    m18.push(DynamicErcEngine.violation(ErcSeverity.ERROR, `频率异常偏高: ${q18.probeName} ≈ ${(w18 / 1e6).toFixed(1)}MHz`, q18.netName, '检查信号完整性或 EMI'));
                }
            }
            if (q18.waveType === 'current' || q18.currentAxis.length > 0) {
                const v18 = arrayMax(q18.currentAxis.length > 0 ? q18.currentAxis : q18.voltageAxis);
                if (v18 > 0.5) {
                    m18.push(DynamicErcEngine.violation(ErcSeverity.ERROR, `过流检测: ${q18.probeName} 峰值 ${v18.toFixed(3)}A`, q18.netName, '检查负载短路或限流电阻'));
                }
            }
        }
        l18.forEach((n18: string, o18: string) => {
            if (n18 === 'X' || n18 === 'conflict') {
                m18.push(DynamicErcEngine.violation(ErcSeverity.ERROR, `数字总线冲突/高阻异常: ${o18}`, o18, '检查输出引脚短接'));
            }
        });
        return m18;
    }
    private static violation(g18: ErcSeverity, h18: string, i18: string, j18: string): ErcViolation {
        return {
            id: IdUtil.generate('derc'),
            severity: g18,
            ruleType: ErcRuleType.PIN_CONFLICT,
            message: h18,
            netId: i18,
            fixSuggestion: j18
        };
    }
    private static estimateFrequency(z17: WaveData): number {
        const a18 = z17.voltageAxis;
        const b18 = z17.timeAxis;
        if (a18.length < 4 || b18.length < 4)
            return 0;
        const c18 = (arrayMin(a18) + arrayMax(a18)) / 2;
        let d18 = 0;
        for (let f18 = 1; f18 < a18.length; f18++) {
            if ((a18[f18 - 1] < c18 && a18[f18] >= c18) || (a18[f18 - 1] >= c18 && a18[f18] < c18)) {
                d18++;
            }
        }
        const e18 = b18[b18.length - 1] - b18[0];
        if (e18 <= 0 || d18 < 2)
            return 0;
        return (d18 / 2) / e18;
    }
}
