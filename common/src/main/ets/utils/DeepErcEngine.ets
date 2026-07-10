/**
 * ERC 深度静态规则引擎（文档第三节完整细分）
 */
import {
  SchematicDocument, ErcViolation, ErcSeverity, ErcRuleType, ComponentInstance
} from '../types/CommonTypes';
import { ErcEngine, PinResolverFn } from './ErcEngine';
import { UnitParser } from './UnitParser';
import { IdUtil } from './IdUtil';
import { appendArray, paramMapGet, parseVoltageVolts } from './MapHelpers';

const MCU_IDS = new Set([
  'AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS',
  'STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'
]);

export class DeepErcEngine {
  static runFull(doc: SchematicDocument, pinResolver?: PinResolverFn): ErcViolation[] {
    const violations = ErcEngine.run(doc, MCU_IDS, pinResolver);
    appendArray(violations, DeepErcEngine.checkPowerErrors(doc));
    appendArray(violations, DeepErcEngine.checkPinErrors(doc));
    appendArray(violations, DeepErcEngine.checkParamErrors(doc));
    return violations;
  }

  private static checkPowerErrors(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const hasMcu = doc.components.some(c => MCU_IDS.has(c.libraryId) ||
      c.libraryId.includes('STM32') || c.libraryId.includes('AT89') || c.libraryId.includes('STC'));
    // Check both parameter value AND library ID for decoupling caps,
    // since template-generated components may use emptyStringMap().
    const decoupling = doc.components.filter(c => {
      if (!c.libraryId.startsWith('C_')) {
        return false;
      }
      const value = paramMapGet(c.parameters, 'value', '');
      return value.includes('100n') || value.includes('0.1u') ||
        c.libraryId.includes('100n') || c.libraryId.includes('0.1u');
    });

    if (hasMcu && decoupling.length === 0) {
      result.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.PARAM_MISMATCH,
        'MCU VDD/VCC 缺少 0.1uF 滤波电容', undefined, undefined, '每个 MCU 电源引脚附近添加 100nF 去耦电容'));
    }

    const hasAnalog = doc.components.some(c => c.libraryId.includes('LM358') || c.libraryId.includes('UA741'));
    const hasDigital = doc.components.some(c => c.libraryId.includes('74HC'));
    if (hasAnalog && hasDigital) {
      const avdd = doc.nets.some(n => n.name.includes('AVDD') || n.name.includes('VDDA'));
      if (!avdd) {
        result.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.POWER_REVERSED,
          '模拟与数字电源可能未隔离', undefined, undefined, '模拟电源与数字电源应通过磁珠或独立 LDO 隔离'));
      }
    }

    return result;
  }

  private static checkPinErrors(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];

    for (let i = 0; i < doc.components.length; i++) {
      const comp = doc.components[i];
      if (comp.libraryId.includes('AT89') || comp.libraryId.includes('STC')) {
        const hasPullUp = doc.components.some(c => c.libraryId.startsWith('R_') &&
          Math.abs(c.position.x - comp.position.x) < 150);
        if (!hasPullUp) {
          result.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.UNCONNECTED_PIN,
            `51 单片机 ${comp.refDes} P0 口可能无外部上拉`, comp.id, undefined,
            '51 P0 口无内部上拉，需外接 10kΩ 排阻'));
        }
      }

      if (comp.libraryId.includes('STM32')) {
        const hasReset = doc.nets.some(n => n.name.includes('NRST') || n.name.includes('RESET'));
        if (!hasReset) {
          result.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.MISSING_RESET,
            `STM32 ${comp.refDes} 复位引脚可能悬空`, comp.id, undefined, 'NRST 添加 10kΩ 上拉 + 100nF 电容'));
        }
      }

      if (comp.libraryId.includes('LED') && !DeepErcEngine.hasNearbyResistor(doc, comp)) {
        result.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.IO_OVERCURRENT,
          `LED ${comp.refDes} 无限流电阻`, comp.id, undefined, '串联 220Ω~1kΩ 限流电阻'));
      }
    }

    const crystals = doc.components.filter(c => c.libraryId.includes('XTAL'));
    for (let i = 0; i < crystals.length; i++) {
      const xtal = crystals[i];
      const loadCaps = doc.components.filter(c => c.libraryId.startsWith('C_') &&
        Math.abs(c.position.x - xtal.position.x) < 80);
      if (loadCaps.length < 2) {
        result.push(DeepErcEngine.violation(ErcSeverity.ERROR, ErcRuleType.MISSING_CRYSTAL,
          `晶振 ${xtal.refDes} 负载电容不足`, xtal.id, undefined, '晶振两侧各添加负载电容（通常 10~30pF）'));
      }
    }

    return result;
  }

  private static checkParamErrors(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];

    for (let i = 0; i < doc.components.length; i++) {
      const comp = doc.components[i];
      if (comp.libraryId.startsWith('R_')) {
        const val = paramMapGet(comp.parameters, 'value', comp.libraryId.replace('R_', ''));
        const parsed = UnitParser.parseResistance(val.endsWith('Ω') ? val : `${val}Ω`);
        const powerStr = paramMapGet(comp.parameters, 'power', '0.25W');
        const powerParsed = UnitParser.parsePower(powerStr);
        const powerW = powerParsed.valid ? powerParsed.numeric : 0.25;
        if (parsed.valid && parsed.numeric > 0) {
          const supplyV = DeepErcEngine.estimateSupplyVoltage(doc);
          const estPower = supplyV * supplyV / parsed.numeric;
          if (estPower > powerW * 0.8) {
            result.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.PARAM_MISMATCH,
              `${comp.refDes} 电阻功率可能不足 (估算 ${estPower.toFixed(3)}W @ ${supplyV}V, ` +
                `阻值 ${parsed.normalized}, 额定 ${powerW}W)`,
              comp.id, undefined, '降低电源电压、增大阻值或选用更大功率电阻（修改 power 参数）'));
          }
        }
      }

      if (comp.libraryId.startsWith('C_')) {
        const voltageStr = paramMapGet(comp.parameters, 'voltage', '50');
        const voltage = parseFloat(voltageStr) || 50;
        if (voltage < 16) {
          result.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.PARAM_MISMATCH,
            `${comp.refDes} 电容耐压 ${voltage}V 可能低于工作电压`, comp.id, undefined, '选用 50V 及以上耐压'));
        }
      }

      if (comp.libraryId.includes('2N') || comp.libraryId.includes('BC')) {
        const hasBaseRes = doc.components.some(c => c.libraryId.startsWith('R_') &&
          Math.abs(c.position.x - comp.position.x) < 100);
        if (!hasBaseRes) {
          result.push(DeepErcEngine.violation(ErcSeverity.WARNING, ErcRuleType.PARAM_MISMATCH,
            `三极管 ${comp.refDes} 基极可能无偏置电阻`, comp.id, undefined, '添加基极分压或限流电阻'));
        }
      }
    }

    return result;
  }

  private static estimateSupplyVoltage(doc: SchematicDocument): number {
    for (let i = 0; i < doc.components.length; i++) {
      const comp = doc.components[i];
      const lib = comp.libraryId.toUpperCase();
      if (lib === 'VCC' || lib.endsWith('/VCC') || lib.includes('POWER_5V') ||
          lib.includes('VDC') || lib.includes('VAC') || lib.includes('POWER')) {
        const v = paramMapGet(comp.parameters, 'voltage', '5V');
        return parseVoltageVolts(v, 5);
      }
    }
    return 5;
  }

  private static hasNearbyResistor(doc: SchematicDocument, comp: ComponentInstance): boolean {
    return doc.components.some(c => c.libraryId.startsWith('R_') &&
      Math.abs(c.position.x - comp.position.x) < 100 && Math.abs(c.position.y - comp.position.y) < 80);
  }

  private static violation(severity: ErcSeverity, ruleType: ErcRuleType, message: string,
    componentId?: string, netId?: string, fix?: string): ErcViolation {
    return {
      id: IdUtil.generate('erc'),
      severity: severity,
      ruleType: ruleType,
      message: message,
      componentId: componentId,
      netId: netId,
      fixSuggestion: fix
    };
  }
}
