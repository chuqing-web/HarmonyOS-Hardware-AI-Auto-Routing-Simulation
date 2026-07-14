import type { SchTopology } from '../types/TopologyTypes';
import type { WaveData } from '../types/SimExtendedTypes';
import { copyStringMap, paramMapGet } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
interface BomMergeEntry {
    refs: string[];
    params: Map<string, string>;
}
export class ExportPostProcessor {
    static mergeBom(a23: SchTopology): string {
        const b23: Map<string, BomMergeEntry> = new Map();
        for (let l23 = 0; l23 < a23.deviceList.length; l23++) {
            const m23 = a23.deviceList[l23];
            const n23 = `${m23.libDevId}|${JSON.stringify(Array.from(m23.params.entries()))}`;
            if (!b23.has(n23)) {
                b23.set(n23, { refs: [], params: copyStringMap(m23.params) });
            }
            const o23 = b23.get(n23);
            if (o23) {
                o23.refs.push(m23.refName);
            }
        }
        let c23 = '位号,器件型号,封装/值,数量,备注\n';
        b23.forEach((d23: BomMergeEntry, e23: string) => {
            const f23 = e23.split('|')[0];
            const g23: string[] = ['value', 'Value', 'resistance', 'capacitance', 'voltage'];
            let h23 = '';
            for (let j23 = 0; j23 < g23.length; j23++) {
                const k23 = paramMapGet(d23.params, g23[j23], '');
                if (k23.length > 0) {
                    h23 = k23;
                    break;
                }
            }
            const i23 = paramMapGet(d23.params, 'footprint', paramMapGet(d23.params, 'package', ''));
            if (h23.length === 0 && i23.length > 0) {
                h23 = i23;
            }
            c23 += `"${d23.refs.join(' ')}","${f23}","${h23}",${d23.refs.length},""\n`;
        });
        return c23;
    }
    static waveCsvWithHeader(u22: WaveData[]): string {
        let v22 = '# AI-SCH Waveform Export\n# time(s), channel, unit(V/A)\n';
        for (let w22 = 0; w22 < u22.length; w22++) {
            const x22 = u22[w22];
            v22 += `# Channel: ${x22.probeName}, Net: ${x22.netName}, Rate: ${x22.sampleRate}Hz\n`;
            for (let y22 = 0; y22 < x22.timeAxis.length; y22++) {
                const z22 = x22.voltageAxis[y22] ?? 0;
                v22 += `${x22.timeAxis[y22]},${x22.probeName},${z22}\n`;
            }
        }
        return v22;
    }
    static autoFileName(r22: string, s22: string): string {
        const t22 = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `${r22}_${t22}.${s22}`;
    }
    static spiceNetlistFilter(l22: string, m22: boolean): string {
        if (m22) {
            return l22;
        }
        const n22 = l22.split('\n');
        const o22: string[] = [];
        for (let p22 = 0; p22 < n22.length; p22++) {
            const q22 = n22[p22];
            if (!q22.includes('probe') && !q22.includes('OSCILLOSCOPE') && !q22.includes('VIRTUAL_METER')) {
                o22.push(q22);
            }
        }
        return o22.join('\n');
    }
}
