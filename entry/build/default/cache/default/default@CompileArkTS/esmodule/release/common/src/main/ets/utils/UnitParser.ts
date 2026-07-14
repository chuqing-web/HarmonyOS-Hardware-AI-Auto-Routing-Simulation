import { ErrCode } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/ErrCode";
export interface ParsedValue {
    numeric: number;
    unit: string;
    normalized: string;
    valid: boolean;
    errCode: ErrCode;
}
export class UnitParser {
    static parseResistance(p54: string): ParsedValue {
        return UnitParser.parseGeneric(p54, 'Ω', UnitParser.getResistanceMultipliers());
    }
    static parseCapacitance(o54: string): ParsedValue {
        return UnitParser.parseGeneric(o54, 'F', UnitParser.getCapMultipliers());
    }
    static parseInductance(n54: string): ParsedValue {
        return UnitParser.parseGeneric(n54, 'H', UnitParser.getIndMultipliers());
    }
    static parseFrequency(m54: string): ParsedValue {
        return UnitParser.parseGeneric(m54, 'Hz', UnitParser.getFreqMultipliers());
    }
    static parsePower(e54: string): ParsedValue {
        const f54 = e54.trim().replace(/\s+/g, '');
        if (f54.length === 0) {
            return { numeric: 0.25, unit: 'W', normalized: '0.25W', valid: true, errCode: ErrCode.OK };
        }
        const g54 = f54.match(/^([\d.]+)\s*mw$/i);
        if (g54) {
            const l54 = parseFloat(g54[1]) / 1000;
            if (!isNaN(l54) && l54 > 0) {
                return { numeric: l54, unit: 'W', normalized: `${l54}W`, valid: true, errCode: ErrCode.OK };
            }
        }
        const h54 = f54.match(/^([\d.]+)\s*kw$/i);
        if (h54) {
            const k54 = parseFloat(h54[1]) * 1000;
            if (!isNaN(k54) && k54 > 0) {
                return { numeric: k54, unit: 'W', normalized: `${k54}W`, valid: true, errCode: ErrCode.OK };
            }
        }
        const i54 = f54.match(/^([\d.]+)\s*W?$/i);
        if (i54) {
            const j54 = parseFloat(i54[1]);
            if (!isNaN(j54) && j54 > 0) {
                return { numeric: j54, unit: 'W', normalized: `${j54}W`, valid: true, errCode: ErrCode.OK };
            }
        }
        return { numeric: 0.25, unit: 'W', normalized: '0.25W', valid: false, errCode: ErrCode.ERR_PARAM_INVALID };
    }
    static normalizeParam(b54: string, c54: string): ParsedValue {
        const d54 = c54.trim().replace(/\s+/g, '');
        if (b54.includes('res') || b54 === 'value' && d54.includes('k') || d54.includes('R') || d54.includes('Ω')) {
            return UnitParser.parseResistance(d54);
        }
        if (b54.includes('cap') || d54.includes('F') || d54.includes('p') || d54.includes('u') || d54.includes('n')) {
            return UnitParser.parseCapacitance(d54);
        }
        if (b54.includes('freq') || b54.includes('clock') || d54.includes('Hz') || d54.includes('M')) {
            return UnitParser.parseFrequency(d54);
        }
        if (b54.includes('power') || b54.includes('watt') || d54.toUpperCase().endsWith('W')) {
            return UnitParser.parsePower(d54);
        }
        return { numeric: parseFloat(d54) || 0, unit: '', normalized: d54, valid: !isNaN(parseFloat(d54)), errCode: ErrCode.OK };
    }
    static validateParam(w53: string, x53: string, y53?: number, z53?: number): ParsedValue {
        const a54 = UnitParser.normalizeParam(w53, x53);
        if (!a54.valid) {
            a54.errCode = ErrCode.ERR_PARAM_INVALID;
            return a54;
        }
        if (a54.numeric < 0 && (w53.includes('res') || w53.includes('cap'))) {
            a54.valid = false;
            a54.errCode = ErrCode.ERR_PARAM_INVALID;
        }
        if (y53 !== undefined && a54.numeric < y53) {
            a54.errCode = ErrCode.ERR_PARAM_INVALID;
        }
        if (z53 !== undefined && a54.numeric > z53) {
            a54.errCode = ErrCode.ERR_PARAM_INVALID;
        }
        return a54;
    }
    static convertLength(s53: number, t53: 'mil' | 'mm' | 'inch', u53: 'mil' | 'mm' | 'inch'): number {
        let v53 = s53;
        if (t53 === 'mil') {
            v53 = s53 * 0.0254;
        }
        else if (t53 === 'inch') {
            v53 = s53 * 25.4;
        }
        if (u53 === 'mil') {
            return v53 / 0.0254;
        }
        if (u53 === 'inch') {
            return v53 / 25.4;
        }
        return v53;
    }
    private static getResistanceMultipliers(): Map<string, number> {
        const r53 = new Map<string, number>();
        r53.set('R', 1);
        r53.set('Ω', 1);
        r53.set('K', 1e3);
        r53.set('k', 1e3);
        r53.set('M', 1e6);
        r53.set('m', 1e6);
        return r53;
    }
    private static getCapMultipliers(): Map<string, number> {
        const q53 = new Map<string, number>();
        q53.set('F', 1);
        q53.set('p', 1e-12);
        q53.set('P', 1e-12);
        q53.set('n', 1e-9);
        q53.set('N', 1e-9);
        q53.set('u', 1e-6);
        q53.set('U', 1e-6);
        q53.set('µ', 1e-6);
        q53.set('m', 1e-3);
        return q53;
    }
    private static getIndMultipliers(): Map<string, number> {
        const p53 = new Map<string, number>();
        p53.set('H', 1);
        p53.set('m', 1e-3);
        p53.set('u', 1e-6);
        p53.set('n', 1e-9);
        return p53;
    }
    private static getFreqMultipliers(): Map<string, number> {
        const o53 = new Map<string, number>();
        o53.set('Hz', 1);
        o53.set('hz', 1);
        o53.set('K', 1e3);
        o53.set('k', 1e3);
        o53.set('M', 1e6);
        o53.set('m', 1e6);
        o53.set('G', 1e9);
        return o53;
    }
    private static parseGeneric(y52: string, z52: string, a53: Map<string, number>): ParsedValue {
        let b53 = y52.trim().replace(/\s+/g, '');
        if (b53.indexOf('Ω') >= 0) {
            b53 = b53.replace(/Ω/g, '');
            if (/^\d+\.?\d*$/.test(b53)) {
                b53 = `${b53}R`;
            }
        }
        if (b53.length === 0) {
            return { numeric: 0, unit: z52, normalized: '', valid: false, errCode: ErrCode.ERR_PARAM_INVALID };
        }
        const c53 = b53.match(/^([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*([a-zA-Zµ]+)?$/);
        if (c53) {
            const i53 = parseFloat(c53[1]);
            let j53 = c53[2] ?? '';
            if (j53.length > 1 && (j53.endsWith('R') || j53.toUpperCase().endsWith('OHM'))) {
                if (j53.toUpperCase().endsWith('OHM')) {
                    j53 = j53.substring(0, j53.length - 3);
                }
                else {
                    j53 = j53.substring(0, j53.length - 1);
                }
            }
            let k53 = 1;
            if (j53.length > 0) {
                const m53 = j53.charAt(j53.length - 1);
                const n53 = j53.substring(0, j53.length - 1);
                if (a53.has(j53)) {
                    k53 = a53.get(j53) as number;
                }
                else if (a53.has(m53)) {
                    k53 = a53.get(m53) as number;
                }
                else if (n53.length > 0 && a53.has(n53 + m53)) {
                    k53 = a53.get(n53 + m53) as number;
                }
            }
            const l53 = i53 * k53;
            if (l53 < 0) {
                return { numeric: l53, unit: z52, normalized: b53, valid: false, errCode: ErrCode.ERR_PARAM_INVALID };
            }
            return { numeric: l53, unit: z52, normalized: `${l53}${z52}`, valid: true, errCode: ErrCode.OK };
        }
        const d53 = b53.match(/^([+-]?\d+\.?\d*)\s*([kKmMµuUnNpP]?)R?$/);
        if (d53) {
            const e53 = parseFloat(d53[1]);
            const f53 = d53[2] || '';
            let g53 = 1;
            if (f53.length > 0 && a53.has(f53)) {
                g53 = a53.get(f53) as number;
            }
            const h53 = e53 * g53;
            return {
                numeric: h53, unit: z52,
                normalized: `${h53}${z52}`,
                valid: h53 >= 0, errCode: h53 >= 0 ? ErrCode.OK : ErrCode.ERR_PARAM_INVALID
            };
        }
        return { numeric: 0, unit: z52, normalized: b53, valid: false, errCode: ErrCode.ERR_PARAM_INVALID };
    }
}
