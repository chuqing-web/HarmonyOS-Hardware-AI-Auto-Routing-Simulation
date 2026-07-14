import { ErcSeverity, ErcRuleType, IdUtil, paramMapGet } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ErcViolation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ErcEngine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const MCU_IDS = new Set([
    'AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS',
    'STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'
]);
export class FaultDiagnoser {
    static diagnose(y282: SchematicDocument): ErcViolation[] {
        const z282 = ErcEngine.run(y282, MCU_IDS);
        const a283 = FaultDiagnoser.checkParamMismatch(y282);
        for (let d283 = 0; d283 < a283.length; d283++) {
            z282.push(a283[d283]);
        }
        const b283 = FaultDiagnoser.checkIoRisks(y282);
        for (let c283 = 0; c283 < b283.length; c283++) {
            z282.push(b283[c283]);
        }
        return z282;
    }
    private static checkParamMismatch(s282: SchematicDocument): ErcViolation[] {
        const t282: ErcViolation[] = [];
        for (const u282 of s282.components) {
            if (u282.libraryId.startsWith('R_')) {
                const x282 = paramMapGet(u282.parameters, 'value', u282.libraryId.replace('R_', ''));
                if (x282.includes('k') && parseInt(x282) > 100) {
                    t282.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.WARNING,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `${u282.refDes} 阻值 ${x282} 可能过大，影响驱动能力`,
                        componentId: u282.id,
                        fixSuggestion: 'LED 限流电阻建议 220Ω~1kΩ'
                    });
                }
            }
            const v282 = u282.parameters.get('voltage');
            if (u282.libraryId.startsWith('C_') && v282 !== undefined) {
                const w282 = parseInt(v282);
                if (w282 < 16) {
                    t282.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.WARNING,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `${u282.refDes} 耐压 ${w282}V 可能不足`,
                        componentId: u282.id,
                        fixSuggestion: '电源去耦电容建议 50V 以上'
                    });
                }
            }
        }
        return t282;
    }
    private static checkIoRisks(h282: SchematicDocument): ErcViolation[] {
        const i282: ErcViolation[] = [];
        const j282 = h282.components.filter(r282 => r282.libraryId.includes('LED'));
        const k282 = h282.components.filter(q282 => q282.libraryId.startsWith('R_'));
        for (const l282 of j282) {
            const m282 = k282.some(n282 => {
                const o282 = Math.abs(n282.position.x - l282.position.x);
                const p282 = Math.abs(n282.position.y - l282.position.y);
                return o282 < 100 && p282 < 100;
            });
            if (!m282) {
                i282.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.IO_OVERCURRENT,
                    message: `LED ${l282.refDes} 缺少限流电阻，可能烧毁`,
                    componentId: l282.id,
                    fixSuggestion: '串联 220Ω~1kΩ 电阻'
                });
            }
        }
        return i282;
    }
}
