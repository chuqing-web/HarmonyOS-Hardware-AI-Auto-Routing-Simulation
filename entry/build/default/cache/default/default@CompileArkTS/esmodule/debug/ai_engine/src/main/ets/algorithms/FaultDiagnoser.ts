import { ErcSeverity, ErcRuleType, IdUtil, paramMapGet } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument, ErcViolation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ErcEngine } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
const MCU_IDS = new Set([
    'AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS',
    'STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'
]);
export class FaultDiagnoser {
    static diagnose(schematic: SchematicDocument): ErcViolation[] {
        const violations = ErcEngine.run(schematic, MCU_IDS);
        const paramViolations = FaultDiagnoser.checkParamMismatch(schematic);
        for (let i = 0; i < paramViolations.length; i++) {
            violations.push(paramViolations[i]);
        }
        const ioViolations = FaultDiagnoser.checkIoRisks(schematic);
        for (let i = 0; i < ioViolations.length; i++) {
            violations.push(ioViolations[i]);
        }
        return violations;
    }
    private static checkParamMismatch(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        for (const comp of doc.components) {
            if (comp.libraryId.startsWith('R_')) {
                const val = paramMapGet(comp.parameters, 'value', comp.libraryId.replace('R_', ''));
                if (val.includes('k') && parseInt(val) > 100) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.WARNING,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `${comp.refDes} 阻值 ${val} 可能过大，影响驱动能力`,
                        componentId: comp.id,
                        fixSuggestion: 'LED 限流电阻建议 220Ω~1kΩ'
                    });
                }
            }
            const voltageParam = comp.parameters.get('voltage');
            if (comp.libraryId.startsWith('C_') && voltageParam !== undefined) {
                const v = parseInt(voltageParam);
                if (v < 16) {
                    result.push({
                        id: IdUtil.generate('erc'),
                        severity: ErcSeverity.WARNING,
                        ruleType: ErcRuleType.PARAM_MISMATCH,
                        message: `${comp.refDes} 耐压 ${v}V 可能不足`,
                        componentId: comp.id,
                        fixSuggestion: '电源去耦电容建议 50V 以上'
                    });
                }
            }
        }
        return result;
    }
    private static checkIoRisks(doc: SchematicDocument): ErcViolation[] {
        const result: ErcViolation[] = [];
        const leds = doc.components.filter(c => c.libraryId.includes('LED'));
        const resistors = doc.components.filter(c => c.libraryId.startsWith('R_'));
        for (const led of leds) {
            const hasResistor = resistors.some(r => {
                const dx = Math.abs(r.position.x - led.position.x);
                const dy = Math.abs(r.position.y - led.position.y);
                return dx < 100 && dy < 100;
            });
            if (!hasResistor) {
                result.push({
                    id: IdUtil.generate('erc'),
                    severity: ErcSeverity.ERROR,
                    ruleType: ErcRuleType.IO_OVERCURRENT,
                    message: `LED ${led.refDes} 缺少限流电阻，可能烧毁`,
                    componentId: led.id,
                    fixSuggestion: '串联 220Ω~1kΩ 电阻'
                });
            }
        }
        return result;
    }
}
