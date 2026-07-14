import { DynamicErcEngine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData, ErcViolation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface AiDiagnosisReport {
    summary: string;
    suggestions: string[];
    severity: 'info' | 'warning' | 'error';
}
export class AiDiagnosisReporter {
    static analyze(t307: WaveData[], u307: ErcViolation[], v307?: string): AiDiagnosisReport {
        const w307: string[] = [];
        let x307: 'info' | 'warning' | 'error' = 'info';
        for (let g308 = 0; g308 < u307.length; g308++) {
            const h308 = u307[g308];
            w307.push(`[${h308.severity}] ${h308.message}: ${h308.fixSuggestion ?? '检查连接'}`);
            if (h308.severity === 'error')
                x307 = 'error';
            else if (h308.severity === 'warning' && x307 !== 'error')
                x307 = 'warning';
        }
        for (let b308 = 0; b308 < t307.length; b308++) {
            const c308 = t307[b308];
            if (c308.voltageAxis.length < 2)
                continue;
            let d308 = -Infinity;
            let e308 = Infinity;
            for (let f308 = 0; f308 < c308.voltageAxis.length; f308++) {
                if (c308.voltageAxis[f308] > d308)
                    d308 = c308.voltageAxis[f308];
                if (c308.voltageAxis[f308] < e308)
                    e308 = c308.voltageAxis[f308];
            }
            if (d308 > 5.5) {
                w307.push(`${c308.probeName}: 过压 ${d308.toFixed(2)}V — 检查电源/稳压`);
                x307 = 'error';
            }
            if (d308 - e308 < 0.01) {
                w307.push(`${c308.probeName}: 波形平坦 — 检查探头/接地`);
                if (x307 === 'info')
                    x307 = 'warning';
            }
        }
        const y307 = DynamicErcEngine.analyze(t307, new Map());
        for (let a308 = 0; a308 < y307.length; a308++) {
            w307.push(`动态ERC: ${y307[a308].message}`);
        }
        if (v307 && v307.length > 0) {
            w307.push(`AI 分析: ${v307.substring(0, 200)}`);
        }
        const z307 = w307.length > 0
            ? `检测到 ${w307.length} 项异常`
            : '波形正常，未发现明显异常';
        return { summary: z307, suggestions: w307, severity: x307 };
    }
}
