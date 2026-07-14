import { ErcSeverity, ErcRuleType } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import type { SchematicDocument, ErcViolation, ComponentInstance } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/CommonTypes";
import { ErcEngine } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/ErcEngine";
import type { PinResolverFn } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/ErcEngine";
import { UnitParser } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/UnitParser";
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { appendArray, paramMapGet, parseVoltageVolts } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
import { getPinNetMap } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
const MCU_IDS = new Set([
    'AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS',
    'STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'
]);
export class DeepErcEngine {
    static runFull(w17: SchematicDocument, x17?: PinResolverFn): ErcViolation[] {
        const y17 = ErcEngine.run(w17, MCU_IDS, x17);
        appendArray(y17, DeepErcEngine.checkPowerErrors(w17));
        appendArray(y17, DeepErcEngine.checkPinErrors(w17));
        appendArray(y17, DeepErcEngine.checkParamErrors(w17));
        return y17;
    }
    private static checkPowerErrors(j17: SchematicDocument): ErcViolation[] {
        const k17: ErcViolation[] = [];
        const l17 = j17.components.some(v17 => MCU_IDS.has(v17.libraryId) ||
            v17.libraryId.includes('STM32') || v17.libraryId.includes('AT89') || v17.libraryId.includes('STC'));
        const m17 = j17.components.filter(t17 => {
            if (!t17.libraryId.startsWith('C_')) {
                return false;
            }
            const u17 = paramMapGet(t17.parameters, 'value', '');
            return u17.includes('100n') || u17.includes('0.1u') ||
                t17.libraryId.includes('100n') || t17.libraryId.includes('0.1u');
        });
        if (l17 && m17.length === 0) {
            k17.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.PARAM_MISMATCH, 'MCU VDD/VCC 缺少 0.1uF 滤波电容', undefined, undefined, '每个 MCU 电源引脚附近添加 100nF 去耦电容'));
        }
        const n17 = j17.components.some(s17 => s17.libraryId.includes('LM358') || s17.libraryId.includes('UA741'));
        const o17 = j17.components.some(r17 => r17.libraryId.includes('74HC'));
        if (n17 && o17) {
            const p17 = j17.nets.some(q17 => q17.name.includes('AVDD') || q17.name.includes('VDDA'));
            if (!p17) {
                k17.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.POWER_REVERSED, '模拟与数字电源可能未隔离', undefined, undefined, '模拟电源与数字电源应通过磁珠或独立 LDO 隔离'));
            }
        }
        return k17;
    }
    private static checkPinErrors(v16: SchematicDocument): ErcViolation[] {
        const w16: ErcViolation[] = [];
        for (let d17 = 0; d17 < v16.components.length; d17++) {
            const e17 = v16.components[d17];
            if (e17.libraryId.includes('AT89') || e17.libraryId.includes('STC')) {
                const h17 = v16.components.some(i17 => i17.libraryId.startsWith('R_') &&
                    Math.abs(i17.position.x - e17.position.x) < 150);
                if (!h17) {
                    w16.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.UNCONNECTED_PIN, `51 单片机 ${e17.refDes} P0 口可能无外部上拉`, e17.id, undefined, '51 P0 口无内部上拉，需外接 10kΩ 排阻'));
                }
            }
            if (e17.libraryId.includes('STM32')) {
                const f17 = v16.nets.some(g17 => g17.name.includes('NRST') || g17.name.includes('RESET'));
                if (!f17) {
                    w16.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.MISSING_RESET, `STM32 ${e17.refDes} 复位引脚可能悬空`, e17.id, undefined, 'NRST 添加 10kΩ 上拉 + 100nF 电容'));
                }
            }
            if (e17.libraryId.includes('LED') && !DeepErcEngine.hasSeriesLimitResistor(v16, e17)) {
                w16.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.IO_OVERCURRENT, `LED ${e17.refDes} 无限流电阻`, e17.id, undefined, '串联 220Ω~1kΩ 限流电阻'));
            }
        }
        const x16 = v16.components.filter(c17 => c17.libraryId.includes('XTAL'));
        for (let y16 = 0; y16 < x16.length; y16++) {
            const z16 = x16[y16];
            const a17 = v16.components.filter(b17 => b17.libraryId.startsWith('C_') &&
                Math.abs(b17.position.x - z16.position.x) < 80);
            if (a17.length < 2) {
                w16.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.MISSING_CRYSTAL, `晶振 ${z16.refDes} 负载电容不足`, z16.id, undefined, '晶振两侧各添加负载电容（通常 10~30pF）'));
            }
        }
        return w16;
    }
    private static checkParamErrors(g16: SchematicDocument): ErcViolation[] {
        const h16: ErcViolation[] = [];
        for (let i16 = 0; i16 < g16.components.length; i16++) {
            const j16 = g16.components[i16];
            if (j16.libraryId.startsWith('R_')) {
                let o16 = paramMapGet(j16.parameters, 'value', '');
                if (o16.length === 0) {
                    o16 = j16.libraryId.replace('R_', '');
                }
                const p16 = UnitParser.parseResistance(o16.endsWith('Ω') ? o16 : `${o16}Ω`);
                const q16 = paramMapGet(j16.parameters, 'power', '0.25W');
                const r16 = UnitParser.parsePower(q16.length > 0 ? q16 : '0.25W');
                const s16 = r16.valid ? r16.numeric : 0.25;
                if (p16.valid && p16.numeric > 0) {
                    const t16 = DeepErcEngine.estimateSupplyVoltage(g16);
                    const u16 = t16 * t16 / p16.numeric;
                    if (u16 > s16 * 0.8) {
                        h16.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.PARAM_MISMATCH, `${j16.refDes} 电阻功率可能不足 (估算 ${u16.toFixed(3)}W @ ${t16}V, ` +
                            `阻值 ${p16.normalized}, 额定 ${s16}W)`, j16.id, undefined, '降低电源电压、增大阻值或选用更大功率电阻（修改 power 参数）'));
                    }
                }
            }
            if (j16.libraryId.startsWith('C_')) {
                const m16 = paramMapGet(j16.parameters, 'voltage', '50');
                const n16 = parseFloat(m16) || 50;
                if (n16 < 16) {
                    h16.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.PARAM_MISMATCH, `${j16.refDes} 电容耐压 ${n16}V 可能低于工作电压`, j16.id, undefined, '选用 50V 及以上耐压'));
                }
            }
            if (j16.libraryId.includes('2N') || j16.libraryId.includes('BC')) {
                const k16 = g16.components.some(l16 => l16.libraryId.startsWith('R_') &&
                    Math.abs(l16.position.x - j16.position.x) < 100);
                if (!k16) {
                    h16.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.PARAM_MISMATCH, `三极管 ${j16.refDes} 基极可能无偏置电阻`, j16.id, undefined, '添加基极分压或限流电阻'));
                }
            }
        }
        return h16;
    }
    private static estimateSupplyVoltage(b16: SchematicDocument): number {
        for (let c16 = 0; c16 < b16.components.length; c16++) {
            const d16 = b16.components[c16];
            const e16 = d16.libraryId.toUpperCase();
            if (e16 === 'VCC' || e16.endsWith('/VCC') || e16.includes('POWER_5V') ||
                e16.includes('VDC') || e16.includes('VAC') || e16.includes('POWER')) {
                const f16 = paramMapGet(d16.parameters, 'voltage', '5V');
                return parseVoltageVolts(f16, 5);
            }
        }
        return 5;
    }
    private static hasSeriesLimitResistor(r15: SchematicDocument, s15: ComponentInstance): boolean {
        const t15 = getPinNetMap(s15.id, r15.nets);
        const u15 = t15.get('A') ?? t15.get('1');
        const v15 = t15.get('K') ?? t15.get('2');
        if (u15 === undefined || v15 === undefined) {
            return false;
        }
        for (let w15 = 0; w15 < r15.components.length; w15++) {
            const x15 = r15.components[w15];
            if (!x15.libraryId.startsWith('R_') || x15.id === s15.id) {
                continue;
            }
            const y15 = getPinNetMap(x15.id, r15.nets);
            const z15 = y15.get('1');
            const a16 = y15.get('2');
            if (z15 === undefined || a16 === undefined) {
                continue;
            }
            if ((z15 === u15 && a16 !== v15) || (a16 === u15 && z15 !== v15)) {
                return true;
            }
            if ((z15 === v15 && a16 !== u15) || (a16 === v15 && z15 !== u15)) {
                return true;
            }
        }
        return false;
    }
    private static violation(l15: ErcSeverity, m15: ErcRuleType, n15: string, o15?: string, p15?: string, q15?: string): ErcViolation {
        return {
            id: IdUtil.generate('erc'),
            severity: l15,
            ruleType: m15,
            message: n15,
            componentId: o15,
            netId: p15,
            fixSuggestion: q15
        };
    }
}
