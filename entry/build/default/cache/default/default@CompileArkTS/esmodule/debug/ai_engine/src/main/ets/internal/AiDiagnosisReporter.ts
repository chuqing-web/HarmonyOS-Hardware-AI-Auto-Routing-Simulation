import { DynamicErcEngine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData, ErcViolation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface AiDiagnosisReport {
    summary: string;
    suggestions: string[];
    severity: 'info' | 'warning' | 'error';
}
export class AiDiagnosisReporter {
    static analyze(waves: WaveData[], violations: ErcViolation[], llmText?: string): AiDiagnosisReport {
        const suggestions: string[] = [];
        let severity: 'info' | 'warning' | 'error' = 'info';
        for (let i = 0; i < violations.length; i++) {
            const v = violations[i];
            suggestions.push(`[${v.severity}] ${v.message}: ${v.fixSuggestion ?? '检查连接'}`);
            if (v.severity === 'error')
                severity = 'error';
            else if (v.severity === 'warning' && severity !== 'error')
                severity = 'warning';
        }
        for (let i = 0; i < waves.length; i++) {
            const w = waves[i];
            if (w.voltageAxis.length < 2)
                continue;
            let maxV = -Infinity;
            let minV = Infinity;
            for (let j = 0; j < w.voltageAxis.length; j++) {
                if (w.voltageAxis[j] > maxV)
                    maxV = w.voltageAxis[j];
                if (w.voltageAxis[j] < minV)
                    minV = w.voltageAxis[j];
            }
            if (maxV > 5.5) {
                suggestions.push(`${w.probeName}: 过压 ${maxV.toFixed(2)}V — 检查电源/稳压`);
                severity = 'error';
            }
            if (maxV - minV < 0.01) {
                suggestions.push(`${w.probeName}: 波形平坦 — 检查探头/接地`);
                if (severity === 'info')
                    severity = 'warning';
            }
        }
        const dyn = DynamicErcEngine.analyze(waves, new Map());
        for (let i = 0; i < dyn.length; i++) {
            suggestions.push(`动态ERC: ${dyn[i].message}`);
        }
        if (llmText && llmText.length > 0) {
            suggestions.push(`AI 分析: ${llmText.substring(0, 200)}`);
        }
        const summary = suggestions.length > 0
            ? `检测到 ${suggestions.length} 项异常`
            : '波形正常，未发现明显异常';
        return { summary, suggestions, severity };
    }
}
