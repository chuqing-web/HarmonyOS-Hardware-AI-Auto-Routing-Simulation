/**

 * 导出后处理：BOM 去重、CSV 表头、自动命名

 */

import { SchTopology } from '../types/TopologyTypes';
import { WaveData } from '../types/SimExtendedTypes';
import { copyStringMap, paramMapGet } from './MapHelpers';



interface BomMergeEntry {

  refs: string[];

  params: Map<string, string>;

}



export class ExportPostProcessor {

  static mergeBom(topo: SchTopology): string {

    const merged: Map<string, BomMergeEntry> = new Map();

    for (let i = 0; i < topo.deviceList.length; i++) {

      const dev = topo.deviceList[i];

      const key = `${dev.libDevId}|${JSON.stringify(Array.from(dev.params.entries()))}`;

      if (!merged.has(key)) {

        merged.set(key, { refs: [], params: copyStringMap(dev.params) });

      }

      const entry = merged.get(key);

      if (entry) {

        entry.refs.push(dev.refName);

      }

    }

    let csv = '位号,器件型号,封装/值,数量,备注\n';

    merged.forEach((info: BomMergeEntry, key: string) => {

      const part = key.split('|')[0];

      const valueKeys: string[] = ['value', 'Value', 'resistance', 'capacitance', 'voltage'];

      let valueCol = '';

      for (let i = 0; i < valueKeys.length; i++) {

        const v = paramMapGet(info.params, valueKeys[i], '');

        if (v.length > 0) {

          valueCol = v;

          break;

        }

      }

      const footprint = paramMapGet(info.params, 'footprint', paramMapGet(info.params, 'package', ''));

      if (valueCol.length === 0 && footprint.length > 0) {

        valueCol = footprint;

      }

      csv += `"${info.refs.join(' ')}","${part}","${valueCol}",${info.refs.length},""\n`;

    });

    return csv;

  }



  static waveCsvWithHeader(waves: WaveData[]): string {

    let csv = '# AI-SCH Waveform Export\n# time(s), channel, unit(V/A)\n';

    for (let w = 0; w < waves.length; w++) {

      const wave = waves[w];

      csv += `# Channel: ${wave.probeName}, Net: ${wave.netName}, Rate: ${wave.sampleRate}Hz\n`;

      for (let i = 0; i < wave.timeAxis.length; i++) {

        const v = wave.voltageAxis[i] ?? 0;

        csv += `${wave.timeAxis[i]},${wave.probeName},${v}\n`;

      }

    }

    return csv;

  }



  static autoFileName(projectName: string, ext: string): string {

    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    return `${projectName}_${ts}.${ext}`;

  }



  static spiceNetlistFilter(netlist: string, includeProbes: boolean): string {

    if (includeProbes) {

      return netlist;

    }

    const lines = netlist.split('\n');

    const filtered: string[] = [];

    for (let i = 0; i < lines.length; i++) {

      const line = lines[i];

      if (!line.includes('probe') && !line.includes('OSCILLOSCOPE') && !line.includes('VIRTUAL_METER')) {

        filtered.push(line);

      }

    }

    return filtered.join('\n');

  }

}

