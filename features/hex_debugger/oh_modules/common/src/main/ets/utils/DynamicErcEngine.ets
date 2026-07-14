/**

 * 动态 ERC - 仿真运行中实时检测

 */

import { WaveData } from '../types/SimExtendedTypes';

import { ErcViolation, ErcSeverity, ErcRuleType } from '../types/CommonTypes';

import { IdUtil } from './IdUtil';

import { arrayMin, arrayMax } from './MapHelpers';



export class DynamicErcEngine {

  static analyze(waves: WaveData[], digitalStates: Map<string, string>): ErcViolation[] {

    const violations: ErcViolation[] = [];



    for (let w = 0; w < waves.length; w++) {

      const wave = waves[w];

      if (wave.voltageAxis.length < 2) {

        continue;

      }

      const min = arrayMin(wave.voltageAxis);

      const max = arrayMax(wave.voltageAxis);

      let sum = 0;

      for (let i = 0; i < wave.voltageAxis.length; i++) {

        sum += wave.voltageAxis[i];

      }

      const avg = sum / wave.voltageAxis.length;



      if (max > 5.5) {

        violations.push(DynamicErcEngine.violation(ErcSeverity.ERROR,

          `持续过压: ${wave.probeName} 峰值 ${max.toFixed(2)}V`, wave.netName,

          '检查电源电压或添加限压保护'));

      }

      if (Math.abs(avg) > 4.5 && wave.waveType === 'voltage') {

        violations.push(DynamicErcEngine.violation(ErcSeverity.WARNING,

          `运放可能饱和: ${wave.probeName} 平均 ${avg.toFixed(2)}V`, wave.netName,

          '调整增益或偏置'));

      }

      if (max - min < 0.01 && max > 0.1) {

        violations.push(DynamicErcEngine.violation(ErcSeverity.WARNING,

          `振荡可能不起振: ${wave.probeName} 幅度过小`, wave.netName,

          '检查晶振参数与负载电容'));

      }

      if (wave.timeAxis.length >= 4) {
        const freq = DynamicErcEngine.estimateFrequency(wave);
        if (freq > 0 && freq < 10) {
          violations.push(DynamicErcEngine.violation(ErcSeverity.WARNING,
            `频率异常偏低: ${wave.probeName} ≈ ${freq.toFixed(1)}Hz`, wave.netName,
            '检查时钟源或 RC 时间常数'));
        }
        if (freq > 50e6) {
          violations.push(DynamicErcEngine.violation(ErcSeverity.ERROR,
            `频率异常偏高: ${wave.probeName} ≈ ${(freq / 1e6).toFixed(1)}MHz`, wave.netName,
            '检查信号完整性或 EMI'));
        }
      }

      if (wave.waveType === 'current' || wave.currentAxis.length > 0) {
        const iMax = arrayMax(wave.currentAxis.length > 0 ? wave.currentAxis : wave.voltageAxis);
        if (iMax > 0.5) {
          violations.push(DynamicErcEngine.violation(ErcSeverity.ERROR,
            `过流检测: ${wave.probeName} 峰值 ${iMax.toFixed(3)}A`, wave.netName,
            '检查负载短路或限流电阻'));
        }
      }

    }



    digitalStates.forEach((state: string, pinId: string) => {

      if (state === 'X' || state === 'conflict') {

        violations.push(DynamicErcEngine.violation(ErcSeverity.ERROR,

          `数字总线冲突/高阻异常: ${pinId}`, pinId, '检查输出引脚短接'));

      }

    });



    return violations;

  }



  private static violation(severity: ErcSeverity, message: string, target: string, fix: string): ErcViolation {

    return {

      id: IdUtil.generate('derc'),

      severity: severity,

      ruleType: ErcRuleType.PIN_CONFLICT,

      message: message,

      netId: target,

      fixSuggestion: fix

    };

  }

  private static estimateFrequency(wave: WaveData): number {
    const v = wave.voltageAxis;
    const t = wave.timeAxis;
    if (v.length < 4 || t.length < 4) return 0;
    const mid = (arrayMin(v) + arrayMax(v)) / 2;
    let crossings = 0;
    for (let i = 1; i < v.length; i++) {
      if ((v[i - 1] < mid && v[i] >= mid) || (v[i - 1] >= mid && v[i] < mid)) {
        crossings++;
      }
    }
    const duration = t[t.length - 1] - t[0];
    if (duration <= 0 || crossings < 2) return 0;
    return (crossings / 2) / duration;
  }

}

