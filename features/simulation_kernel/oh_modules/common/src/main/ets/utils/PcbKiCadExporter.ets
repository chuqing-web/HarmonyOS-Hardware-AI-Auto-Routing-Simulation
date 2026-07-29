/**
 * KiCad .kicad_pcb 导出（简化子集，供外部工具只读导入）
 */
import { PcbDocument, PcbLayerId, PcbFootprintInst } from '../types/PcbTypes';
import { getGlobalPcbFootprintLibrary } from './PcbFootprintLibrary';

export interface KiCadPcbExportResult {
  fileName: string;
  content: string;
}

function indent(level: number): string {
  return '  '.repeat(level);
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function footprintBlock(fp: PcbFootprintInst, level: number): string {
  const lib = getGlobalPcbFootprintLibrary();
  const def = lib.getDef(fp.defId);
  const fpName = def ? def.name : fp.defId;
  let s = `${indent(level)}(footprint "${esc(fpName)}"\n`;
  s += `${indent(level + 1)}(layer "F.Cu")\n`;
  s += `${indent(level + 1)}(tedit 0)\n`;
  s += `${indent(level + 1)}(at ${fp.position.x.toFixed(4)} ${fp.position.y.toFixed(4)} ${fp.rotation})\n`;
  s += `${indent(level + 1)}(property "Reference" "${esc(fp.refDes)}")\n`;
  s += `${indent(level + 1)}(property "Value" "${esc(fp.value)}")\n`;
  for (const pad of fp.pads) {
    s += `${indent(level + 1)}(pad "${esc(pad.number)}" smd rect\n`;
    s += `${indent(level + 2)}(at ${pad.pos.x.toFixed(4)} ${pad.pos.y.toFixed(4)})\n`;
    s += `${indent(level + 2)}(size ${pad.size.x.toFixed(4)} ${pad.size.y.toFixed(4)})\n`;
    if (pad.netName && pad.netName.length > 0) {
      s += `${indent(level + 2)}(net ${pad.netId ?? 0} "${esc(pad.netName)}")\n`;
    }
    s += `${indent(level + 1)})\n`;
  }
  s += `${indent(level)})\n`;
  return s;
}

export function exportPcbKiCad(doc: PcbDocument): KiCadPcbExportResult {
  let s = '(kicad_pcb\n';
  s += `${indent(1)}(version 20240108)\n`;
  s += `${indent(1)}(generator "ElecDraw_Harmony")\n`;
  s += `${indent(1)}(general\n`;
  s += `${indent(2)}(thickness 1.6)\n`;
  s += `${indent(1)})\n`;

  s += `${indent(1)}(layers\n`;
  s += `${indent(2)}(0 "F.Cu" signal)\n`;
  s += `${indent(2)}(31 "B.Cu" signal)\n`;
  s += `${indent(2)}(44 "Edge.Cuts" user)\n`;
  s += `${indent(1)})\n`;

  for (const fp of doc.footprints) {
    s += footprintBlock(fp, 1);
  }

  for (const trk of doc.tracks) {
    const layer = trk.layer === PcbLayerId.B_CU ? 'B.Cu' : 'F.Cu';
    s += `${indent(1)}(segment\n`;
    s += `${indent(2)}(start ${trk.start.x.toFixed(4)} ${trk.start.y.toFixed(4)})\n`;
    s += `${indent(2)}(end ${trk.end.x.toFixed(4)} ${trk.end.y.toFixed(4)})\n`;
    s += `${indent(2)}(width ${trk.width.toFixed(4)})\n`;
    s += `${indent(2)}(layer "${layer}")\n`;
    if (trk.netName.length > 0) {
      s += `${indent(2)}(net ${trk.netId} "${esc(trk.netName)}")\n`;
    }
    s += `${indent(1)})\n`;
  }

  const pts = doc.boardOutline.points;
  if (pts.length >= 3) {
    s += `${indent(1)}(gr_poly\n`;
    s += `${indent(2)}(layer "Edge.Cuts")\n`;
    s += `${indent(2)}(pts\n`;
    for (const p of pts) {
      s += `${indent(3)}(xy ${p.x.toFixed(4)} ${p.y.toFixed(4)})\n`;
    }
    s += `${indent(2)})\n`;
    s += `${indent(1)})\n`;
  }

  s += ')\n';
  const safeName = doc.name.replace(/[^\w\-]/g, '_');
  return { fileName: `${safeName}.kicad_pcb`, content: s };
}
