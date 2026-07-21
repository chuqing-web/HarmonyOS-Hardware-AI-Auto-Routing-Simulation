/**

 * 器件参数单位解析与容错

 * 支持 10k / 10 K / 10KΩ / 10000R / 1e-6 F 等写法

 */

import { ErrCode } from '../types/ErrCode';



export interface ParsedValue {

  numeric: number;

  unit: string;

  normalized: string;

  valid: boolean;

  errCode: ErrCode;

}



export class UnitParser {

  static parseResistance(input: string): ParsedValue {

    return UnitParser.parseGeneric(input, 'Ω', UnitParser.getResistanceMultipliers());

  }



  static parseCapacitance(input: string): ParsedValue {

    return UnitParser.parseGeneric(input, 'F', UnitParser.getCapMultipliers());

  }



  static parseInductance(input: string): ParsedValue {

    return UnitParser.parseGeneric(input, 'H', UnitParser.getIndMultipliers());

  }



  static parseFrequency(input: string): ParsedValue {
    // "1kHz" / "1KHz"：先去掉 Hz，再按 k/M 倍率解析（否则 suffix=kHz 匹配不到）
    let s = input.trim().replace(/\s+/g, '');
    if (s.length >= 2 && (s.endsWith('Hz') || s.endsWith('hz') || s.endsWith('HZ'))) {
      s = s.substring(0, s.length - 2);
    }
    return UnitParser.parseGeneric(s, 'Hz', UnitParser.getFreqMultipliers());
  }

  /** Parse power rating: 0.25W / 250mW / 1W */
  static parsePower(input: string): ParsedValue {
    const v = input.trim().replace(/\s+/g, '');
    if (v.length === 0) {
      return { numeric: 0.25, unit: 'W', normalized: '0.25W', valid: true, errCode: ErrCode.OK };
    }
    const mwMatch = v.match(/^([\d.]+)\s*mw$/i);
    if (mwMatch) {
      const w = parseFloat(mwMatch[1]) / 1000;
      if (!isNaN(w) && w > 0) {
        return { numeric: w, unit: 'W', normalized: `${w}W`, valid: true, errCode: ErrCode.OK };
      }
    }
    const kwMatch = v.match(/^([\d.]+)\s*kw$/i);
    if (kwMatch) {
      const w = parseFloat(kwMatch[1]) * 1000;
      if (!isNaN(w) && w > 0) {
        return { numeric: w, unit: 'W', normalized: `${w}W`, valid: true, errCode: ErrCode.OK };
      }
    }
    const wMatch = v.match(/^([\d.]+)\s*W?$/i);
    if (wMatch) {
      const w = parseFloat(wMatch[1]);
      if (!isNaN(w) && w > 0) {
        return { numeric: w, unit: 'W', normalized: `${w}W`, valid: true, errCode: ErrCode.OK };
      }
    }
    return { numeric: 0.25, unit: 'W', normalized: '0.25W', valid: false, errCode: ErrCode.ERR_PARAM_INVALID };
  }



  static normalizeParam(key: string, value: string): ParsedValue {

    const v = value.trim().replace(/\s+/g, '');
    const keyL = key.toLowerCase();

    if (keyL === 'waveform' || keyL === 'wave') {
      const wf = v.toLowerCase();
      const ok = wf === 'sine' || wf === 'sin' || wf === 'square' || wf === 'sq' ||
        wf === 'triangle' || wf === 'tri' || wf === 'saw' || wf === 'sawtooth' ||
        wf === 'pulse' || wf === '正弦' || wf === '方波' || wf === '三角' || wf === '锯齿' ||
        wf === '脉冲';
      let norm = wf;
      if (wf === 'sin' || wf === '正弦') {
        norm = 'sine';
      } else if (wf === 'sq' || wf === '方波') {
        norm = 'square';
      } else if (wf === 'tri' || wf === '三角' || wf === '三角波') {
        norm = 'triangle';
      } else if (wf === 'sawtooth' || wf === '锯齿') {
        norm = 'saw';
      } else if (wf === '脉冲') {
        norm = 'pulse';
      }
      return {
        numeric: 0, unit: '', normalized: norm, valid: ok,
        errCode: ok ? ErrCode.OK : ErrCode.ERR_PARAM_INVALID
      };
    }

    if (keyL === 'dutycycle' || keyL === 'duty' || keyL === 'duty_cycle') {
      let s = v.replace(/%/g, '');
      const n = parseFloat(s);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return {
          numeric: 50, unit: '%', normalized: '50%', valid: false,
          errCode: ErrCode.ERR_PARAM_INVALID
        };
      }
      // 0–1 小数 → 百分比；>1 视为已是百分比
      const pct = n > 0 && n <= 1 ? n * 100 : n;
      return {
        numeric: pct, unit: '%', normalized: `${pct}%`, valid: true, errCode: ErrCode.OK
      };
    }

    if (key.includes('res') || key === 'value' && v.includes('k') || v.includes('R') || v.includes('Ω')) {

      return UnitParser.parseResistance(v);

    }

    if (key.includes('cap') || v.includes('F') || v.includes('p') || v.includes('u') || v.includes('n')) {

      return UnitParser.parseCapacitance(v);

    }

    if (key.includes('freq') || key.includes('clock') || v.includes('Hz') || v.includes('M')) {

      return UnitParser.parseFrequency(v);

    }

    if (key.includes('power') || key.includes('watt') || v.toUpperCase().endsWith('W')) {
      return UnitParser.parsePower(v);
    }

    return { numeric: parseFloat(v) || 0, unit: '', normalized: v, valid: !isNaN(parseFloat(v)), errCode: ErrCode.OK };

  }



  static validateParam(key: string, value: string, min?: number, max?: number): ParsedValue {

    const parsed = UnitParser.normalizeParam(key, value);

    if (!parsed.valid) {

      parsed.errCode = ErrCode.ERR_PARAM_INVALID;

      return parsed;

    }

    if (parsed.numeric < 0 && (key.includes('res') || key.includes('cap'))) {

      parsed.valid = false;

      parsed.errCode = ErrCode.ERR_PARAM_INVALID;

    }

    if (min !== undefined && parsed.numeric < min) {

      parsed.errCode = ErrCode.ERR_PARAM_INVALID;

    }

    if (max !== undefined && parsed.numeric > max) {

      parsed.errCode = ErrCode.ERR_PARAM_INVALID;

    }

    return parsed;

  }



  static convertLength(value: number, from: 'mil' | 'mm' | 'inch', to: 'mil' | 'mm' | 'inch'): number {

    let mm = value;

    if (from === 'mil') {

      mm = value * 0.0254;

    } else if (from === 'inch') {

      mm = value * 25.4;

    }

    if (to === 'mil') {

      return mm / 0.0254;

    }

    if (to === 'inch') {

      return mm / 25.4;

    }

    return mm;

  }



  private static getResistanceMultipliers(): Map<string, number> {

    const m = new Map<string, number>();

    m.set('R', 1);

    m.set('Ω', 1);

    m.set('K', 1e3);

    m.set('k', 1e3);

    m.set('M', 1e6);

    m.set('m', 1e6);

    return m;

  }



  private static getCapMultipliers(): Map<string, number> {

    const m = new Map<string, number>();

    m.set('F', 1);

    m.set('p', 1e-12);

    m.set('P', 1e-12);

    m.set('n', 1e-9);

    m.set('N', 1e-9);

    m.set('u', 1e-6);

    m.set('U', 1e-6);

    m.set('µ', 1e-6);

    m.set('m', 1e-3);

    return m;

  }



  private static getIndMultipliers(): Map<string, number> {

    const m = new Map<string, number>();

    m.set('H', 1);

    m.set('m', 1e-3);

    m.set('u', 1e-6);

    m.set('n', 1e-9);

    return m;

  }



  private static getFreqMultipliers(): Map<string, number> {

    const m = new Map<string, number>();

    m.set('Hz', 1);

    m.set('hz', 1);

    m.set('K', 1e3);

    m.set('k', 1e3);

    m.set('M', 1e6);

    m.set('m', 1e6);

    m.set('G', 1e9);

    return m;

  }



  private static parseGeneric(input: string, baseUnit: string,

    multipliers: Map<string, number>): ParsedValue {

    // 10kΩ → 10k；10Ω → 10R（便于识别欧姆）。勿把 10kΩ 变成 10kR 再按末尾 R×1 误算成 10。
    let s = input.trim().replace(/\s+/g, '');
    if (s.indexOf('Ω') >= 0) {
      s = s.replace(/Ω/g, '');
      if (/^\d+\.?\d*$/.test(s)) {
        s = `${s}R`;
      }
    }

    if (s.length === 0) {

      return { numeric: 0, unit: baseUnit, normalized: '', valid: false, errCode: ErrCode.ERR_PARAM_INVALID };

    }



    const sciMatch = s.match(/^([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*([a-zA-Zµ]+)?$/);

    if (sciMatch) {

      const num = parseFloat(sciMatch[1]);

      let suffix = sciMatch[2] ?? '';

      // 兼容 10kR / 10kOhm：丢掉单位尾巴，保留倍率前缀
      if (suffix.length > 1 && (suffix.endsWith('R') || suffix.toUpperCase().endsWith('OHM'))) {
        if (suffix.toUpperCase().endsWith('OHM')) {
          suffix = suffix.substring(0, suffix.length - 3);
        } else {
          suffix = suffix.substring(0, suffix.length - 1);
        }
      }

      let mult = 1;

      if (suffix.length > 0) {

        const lastChar = suffix.charAt(suffix.length - 1);

        const prefix = suffix.substring(0, suffix.length - 1);

        if (multipliers.has(suffix)) {

          mult = multipliers.get(suffix) as number;

        } else if (multipliers.has(lastChar)) {

          mult = multipliers.get(lastChar) as number;

        } else if (prefix.length > 0 && multipliers.has(prefix + lastChar)) {

          mult = multipliers.get(prefix + lastChar) as number;

        }

      }

      const numeric = num * mult;

      if (numeric < 0) {

        return { numeric: numeric, unit: baseUnit, normalized: s, valid: false, errCode: ErrCode.ERR_PARAM_INVALID };

      }

      return { numeric: numeric, unit: baseUnit, normalized: `${numeric}${baseUnit}`, valid: true, errCode: ErrCode.OK };

    }



    const numMatch = s.match(/^([+-]?\d+\.?\d*)\s*([kKmMµuUnNpP]?)R?$/);

    if (numMatch) {

      const num = parseFloat(numMatch[1]);

      const suffix = numMatch[2] || '';

      let mult = 1;

      if (suffix.length > 0 && multipliers.has(suffix)) {

        mult = multipliers.get(suffix) as number;

      }

      const numeric = num * mult;

      return {

        numeric: numeric, unit: baseUnit,

        normalized: `${numeric}${baseUnit}`,

        valid: numeric >= 0, errCode: numeric >= 0 ? ErrCode.OK : ErrCode.ERR_PARAM_INVALID

      };

    }



    return { numeric: 0, unit: baseUnit, normalized: s, valid: false, errCode: ErrCode.ERR_PARAM_INVALID };

  }

}

