/**
 * 7.4.16 统一 ERC 引擎 — 合并三个引擎为单一入口
 * ErcEngine (静态规则) + DeepErcEngine (位置感知) + DynamicErcEngine (波形分析)
 */
import { SchematicDocument, ErcViolation } from '../types/CommonTypes';
import { WaveData } from '../types/SimExtendedTypes';
import { ErcEngine, PinResolverFn } from './ErcEngine';
import { DeepErcEngine } from './DeepErcEngine';
import { DynamicErcEngine } from './DynamicErcEngine';
import { IdUtil } from './IdUtil';
import { appendArray } from './MapHelpers';

export type ErcAnalysisMode = 'static' | 'deep' | 'dynamic' | 'full';

export interface ErcOptions {
  mode?: ErcAnalysisMode;
  mcuLibraryIds?: Set<string>;
  waves?: WaveData[];
  digitalStates?: Map<string, string>;
  disabledRules?: string[];  // 7.4.17 可禁用规则
  pinResolver?: PinResolverFn;
}

// 默认 MCU ID 集合
const DEFAULT_MCU_IDS = new Set([
  'AT89C51', 'AT89C52', 'STC89C52', 'STM32F103C8', 'STM32F103RC',
  'STM32F407VG', 'STM32L431CB', 'STM32F030F4'
]);

export class UnifiedErcEngine {
  /** 7.4.16 统一入口: 按模式分发 */
  static run(doc: SchematicDocument, opts?: ErcOptions): ErcViolation[] {
    const mode = opts?.mode ?? 'full';
    const mcuIds = opts?.mcuLibraryIds ?? DEFAULT_MCU_IDS;
    let violations: ErcViolation[] = [];

    if (mode === 'static') {
      appendArray(violations, ErcEngine.run(doc, mcuIds, opts?.pinResolver));
    }

    if (mode === 'deep' || mode === 'full') {
      // DeepErcEngine.runFull 已内含 ErcEngine.run，full 勿再重复静态遍
      appendArray(violations, DeepErcEngine.runFull(doc, opts?.pinResolver));
    }

    if (mode === 'dynamic' || mode === 'full') {
      if (opts?.waves && opts.waves.length > 0) {
        appendArray(violations, DynamicErcEngine.analyze(
          opts.waves, opts.digitalStates ?? new Map<string, string>()
        ));
      }
    }

    // 7.4.17 过滤被禁用的规则
    if (opts?.disabledRules && opts.disabledRules.length > 0) {
      violations = violations.filter(v => !opts.disabledRules!.includes(v.ruleType));
    }

    return violations;
  }

  /** 7.4.18 批量修复 ERC (自动补充上拉/下拉/去耦等) */
  static autoFix(doc: SchematicDocument, violations: ErcViolation[]): number {
    let fixes = 0;
    // 规则→修复动作 映射表
    const fixMap: Record<string, (doc: SchematicDocument, v: ErcViolation) => boolean> = {
      'FLOATING_INPUT': (d, v) => {
        const targetId = v.componentId ?? '';
        const target = targetId.length > 0
          ? d.components.find(c => c.id === targetId)
          : undefined;
        const nearPullup = target !== undefined && d.components.some(c =>
          c.libraryId.startsWith('R_') &&
          (c.parameters.get('value') === '10k' || c.libraryId.includes('10k')) &&
          Math.hypot(c.position.x - target.position.x, c.position.y - target.position.y) < 200);
        if (nearPullup) {
          return true;
        }
        const hasPullup = d.components.some(c =>
          c.libraryId.startsWith('R_') &&
          (c.parameters.get('value') === '10k' || c.libraryId.includes('10k')));
        if (!hasPullup) {
          const px = target ? target.position.x + 40 : 80;
          const py = target ? target.position.y : 80;
          d.components.push({
            id: IdUtil.generate('inst'),
            libraryId: 'R_10k',
            refDes: 'R?',
            name: 'R_PU',
            pinIds: [IdUtil.generate('pin'), IdUtil.generate('pin')],
            parameters: new Map([['value', '10k']]),
            position: { x: px, y: py },
            rotation: 0,
            mirrored: false
          });
          return true;
        }
        return false;
      },
      'MISSING_DECOUPLING': (d, v) => {
        const targetId = v.componentId ?? '';
        const target = targetId.length > 0
          ? d.components.find(c => c.id === targetId)
          : undefined;
        const nearCap = target !== undefined && d.components.some(c =>
          c.libraryId.startsWith('C_') &&
          (c.libraryId.includes('100n') || c.parameters.get('value') === '100n') &&
          Math.hypot(c.position.x - target.position.x, c.position.y - target.position.y) < 200);
        if (nearCap) {
          return true;
        }
        const hasCap = d.components.some(c =>
          c.libraryId.startsWith('C_') &&
          (c.libraryId.includes('100n') || c.parameters.get('value') === '100n'));
        if (!hasCap) {
          const px = target ? target.position.x + 40 : 80;
          const py = target ? target.position.y + 40 : 120;
          d.components.push({
            id: IdUtil.generate('inst'),
            libraryId: 'C_100nF',
            refDes: 'C?',
            name: 'C_DEC',
            pinIds: [IdUtil.generate('pin'), IdUtil.generate('pin')],
            parameters: new Map([['value', '100n']]),
            position: { x: px, y: py },
            rotation: 0,
            mirrored: false
          });
          return true;
        }
        return false;
      }
    };
    for (const v of violations) {
      const fixer = fixMap[v.ruleType];
      if (fixer && fixer(doc, v)) fixes++;
    }
    return fixes;
  }
}
