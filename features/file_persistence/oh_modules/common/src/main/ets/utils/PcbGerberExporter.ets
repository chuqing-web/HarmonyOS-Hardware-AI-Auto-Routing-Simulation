/**
 * Gerber RS-274X 导出 — 铜层闪铜 / Mask / Silk / Paste / Edge / Drill 分包
 */
import {
  PcbDocument, PcbLayerId, PcbTrack, PcbPadType, PcbPadShape, PcbFootprintInst, PcbPad,
  isCopperLayer, copperLayersFromStack
} from '../types/PcbTypes';
import { Point2D } from '../types/CommonTypes';
import { padWorldPosition } from './PcbZoneUtil';
import { getGlobalPcbFootprintLibrary } from './PcbFootprintLibrary';

export interface GerberLayerFile {
  layerName: string;
  fileName: string;
  content: string;
}

export interface GerberExportResult {
  files: GerberLayerFile[];
}

interface PadExportDef {
  d: number;
  flash: string;
}

function milToMm(v: number): number {
  return v * 0.0254;
}

function fmtCoord(vMil: number): string {
  const iv = Math.round(milToMm(vMil) * 10000);
  const s = Math.abs(iv).toString();
  const padded = s.length >= 6 ? s : '0'.repeat(6 - s.length) + s;
  return iv < 0 ? `X-${padded}` : `X${padded}`;
}

function fmtCoordY(vMil: number): string {
  const iv = Math.round(milToMm(vMil) * 10000);
  const s = Math.abs(iv).toString();
  const padded = s.length >= 6 ? s : '0'.repeat(6 - s.length) + s;
  return iv < 0 ? `Y-${padded}` : `Y${padded}`;
}

function gerberHeader(title: string): string {
  return [
    `G04 ${title}*`,
    '%FSLAX24Y24*%',
    '%MOMM*%',
    '%LPD*%',
    'G01*'
  ].join('\n') + '\n';
}

function apertureCircle(dCode: number, diameterMil: number): string {
  const mm = milToMm(Math.max(1, diameterMil)).toFixed(4);
  return `%ADD${dCode}C,${mm}*%\n`;
}

function apertureRect(dCode: number, wMil: number, hMil: number): string {
  const w = milToMm(Math.max(1, wMil)).toFixed(4);
  const h = milToMm(Math.max(1, hMil)).toFixed(4);
  return `%ADD${dCode}R,${w}X${h}*%\n`;
}

function apertureOval(dCode: number, wMil: number, hMil: number): string {
  const w = milToMm(Math.max(1, wMil)).toFixed(4);
  const h = milToMm(Math.max(1, hMil)).toFixed(4);
  const macroDef = `%AMOVAL${dCode}*\n21,1,${w},${h},0,0,0*%\n`;
  return `${macroDef}%ADD${dCode}OVAL${dCode}*%\n`;
}

function apertureRoundRect(dCode: number, wMil: number, hMil: number, rMil: number): string {
  const w = milToMm(Math.max(1, wMil)).toFixed(4);
  const h = milToMm(Math.max(1, hMil)).toFixed(4);
  const r = milToMm(Math.max(0.1, rMil)).toFixed(4);
  const macroDef = `%AMRR${dCode}*\n21,1,${w},${h},${r},0,0*%\n`;
  return `${macroDef}%ADD${dCode}RR${dCode}*%\n`;
}

function flashPad(x: number, y: number, dCode: number): string {
  return `D${dCode}*\n${fmtCoord(x)}${fmtCoordY(y)}D03*\n`;
}

function appendTrackSegment(trk: PcbTrack, dCode: number): string {
  let s = `G04 net ${trk.netName || trk.netId}*\n`;
  s += `D${dCode}*\n`;
  s += `${fmtCoord(trk.start.x)}${fmtCoordY(trk.start.y)}D02*\n`;
  s += `${fmtCoord(trk.end.x)}${fmtCoordY(trk.end.y)}D01*\n`;
  return s;
}

function exportCopperLayer(doc: PcbDocument, layer: PcbLayerId, fileName: string,
  layerTitle: string): GerberLayerFile {
  let body = gerberHeader(layerTitle);
  let nextD = 10;
  const widthToD: Map<number, number> = new Map();
  const padApertures: string[] = [];

  for (const trk of doc.tracks) {
    if (trk.layer !== layer) continue;
    const w = Math.max(1, Math.round(trk.width));
    if (!widthToD.has(w)) {
      widthToD.set(w, nextD);
      body += apertureCircle(nextD, w);
      nextD++;
    }
  }

  // 焊盘闪铜
  const padDefs: PadExportDef[] = [];
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!padOnCopperLayer(pad, layer, fp)) continue;
      const dCode = nextD++;
      if (pad.shape === PcbPadShape.OVAL || pad.shape === PcbPadShape.ROUNDRECT) {
        if (pad.shape === PcbPadShape.OVAL) {
          padApertures.push(apertureOval(dCode, pad.size.x, pad.size.y));
        } else {
          const r = Math.min(pad.size.x, pad.size.y) * 0.25;
          padApertures.push(apertureRoundRect(dCode, pad.size.x, pad.size.y, r));
        }
      } else if (pad.shape === PcbPadShape.CIRCLE ||
        (pad.size.x === pad.size.y && pad.type !== PcbPadType.SMD)) {
        padApertures.push(apertureCircle(dCode, Math.max(pad.size.x, pad.size.y)));
      } else {
        padApertures.push(apertureRect(dCode, pad.size.x, pad.size.y));
      }
      const wp = padWorldPosition(fp, pad);
      const padDef: PadExportDef = { d: dCode, flash: flashPad(wp.x, wp.y, dCode) };
      padDefs.push(padDef);
    }
  }
  for (const via of doc.vias) {
    if (!viaSpansLayer(via.layers, layer)) continue;
    const dCode = nextD++;
    padApertures.push(apertureCircle(dCode, via.diameter));
    const viaDef: PadExportDef = { d: dCode, flash: flashPad(via.position.x, via.position.y, dCode) };
    padDefs.push(viaDef);
  }

  for (const a of padApertures) {
    body += a;
  }

  for (const trk of doc.tracks) {
    if (trk.layer !== layer) continue;
    const w = Math.max(1, Math.round(trk.width));
    const d = widthToD.get(w) ?? 10;
    body += appendTrackSegment(trk, d);
  }
  for (const p of padDefs) {
    body += p.flash;
  }

  // Zone 覆铜多边形填充 (G36/G37 region)
  for (const z of doc.zones) {
    if (z.layer !== layer) continue;
    if (z.outline.length < 3) continue;
    body += `G04 zone ${z.netName ?? z.netId} priority ${z.priority}*\n`;
    body += 'G36*\n';
    const z0 = z.outline[0];
    body += `${fmtCoord(z0.x)}${fmtCoordY(z0.y)}D02*\n`;
    for (let i = 1; i < z.outline.length; i++) {
      body += `${fmtCoord(z.outline[i].x)}${fmtCoordY(z.outline[i].y)}D01*\n`;
    }
    body += `${fmtCoord(z0.x)}${fmtCoordY(z0.y)}D01*\n`;
    body += 'G37*\n';
  }

  body += 'M02*\n';
  return { layerName: layerTitle, fileName, content: body };
}

function padOnCopperLayer(pad: PcbPad, layer: PcbLayerId, fp: PcbFootprintInst): boolean {
  if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
    return isCopperLayer(layer);
  }
  if (pad.layers && pad.layers.length > 0) {
    for (const l of pad.layers) {
      if (l === layer) return true;
    }
    return false;
  }
  return fp.layer === layer || (fp.mirrored && layer === PcbLayerId.B_CU) ||
    (!fp.mirrored && layer === PcbLayerId.F_CU);
}

function viaSpansLayer(layers: PcbLayerId[], layer: PcbLayerId): boolean {
  for (const l of layers) {
    if (l === layer) return true;
  }
  // 通孔默认贯穿全部铜层
  if (layers.length >= 2 && layers[0] === PcbLayerId.F_CU && layers[layers.length - 1] === PcbLayerId.B_CU) {
    return isCopperLayer(layer);
  }
  return false;
}

function exportMaskLayer(doc: PcbDocument, front: boolean): GerberLayerFile {
  const title = front ? 'F.Mask' : 'B.Mask';
  const fileName = front ? 'F_Mask.gbr' : 'B_Mask.gbr';
  const copper = front ? PcbLayerId.F_CU : PcbLayerId.B_CU;
  let body = gerberHeader(title);
  let nextD = 10;
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!padOnCopperLayer(pad, copper, fp)) continue;
      const inflate = 4;
      const dCode = nextD++;
      body += apertureRect(dCode, pad.size.x + inflate * 2, pad.size.y + inflate * 2);
      const wp = padWorldPosition(fp, pad);
      body += flashPad(wp.x, wp.y, dCode);
    }
  }
  for (const via of doc.vias) {
    if (!viaSpansLayer(via.layers, copper)) continue;
    const dCode = nextD++;
    body += apertureCircle(dCode, via.diameter + 8);
    body += flashPad(via.position.x, via.position.y, dCode);
  }
  body += 'M02*\n';
  return { layerName: title, fileName, content: body };
}

function exportPasteLayer(doc: PcbDocument, front: boolean): GerberLayerFile {
  const title = front ? 'F.Paste' : 'B.Paste';
  const fileName = front ? 'F_Paste.gbr' : 'B_Paste.gbr';
  const copper = front ? PcbLayerId.F_CU : PcbLayerId.B_CU;
  let body = gerberHeader(title);
  let nextD = 10;
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (pad.type !== PcbPadType.SMD) continue;
      if (!padOnCopperLayer(pad, copper, fp)) continue;
      const dCode = nextD++;
      body += apertureRect(dCode, pad.size.x * 0.9, pad.size.y * 0.9);
      const wp = padWorldPosition(fp, pad);
      body += flashPad(wp.x, wp.y, dCode);
    }
  }
  body += 'M02*\n';
  return { layerName: title, fileName, content: body };
}

function localToWorld(local: Point2D, fp: PcbFootprintInst): Point2D {
  let lx = local.x;
  let ly = local.y;
  if (fp.mirrored) lx = -lx;
  if (fp.rotation === 90) { const t = lx; lx = -ly; ly = t; }
  else if (fp.rotation === 180) { lx = -lx; ly = -ly; }
  else if (fp.rotation === 270) { const t = lx; lx = ly; ly = -t; }
  const result: Point2D = { x: fp.position.x + lx, y: fp.position.y + ly };
  return result;
}

function exportSilkLayer(doc: PcbDocument, front: boolean): GerberLayerFile {
  const title = front ? 'F.SilkS' : 'B.SilkS';
  const fileName = front ? 'F_SilkS.gbr' : 'B_SilkS.gbr';
  const lib = getGlobalPcbFootprintLibrary();
  let body = gerberHeader(title);
  body += apertureCircle(10, 6);
  body += 'D10*\n';
  for (const fp of doc.footprints) {
    const onFront = !fp.mirrored && fp.layer !== PcbLayerId.B_CU;
    if (front !== onFront) continue;
    const def = lib.getDef(fp.defId);
    body += `G04 ${fp.refDes}*\n`;
    if (def && def.silkLines.length > 0) {
      // 绘制封装丝印轮廓线
      for (const line of def.silkLines) {
        if (line.length < 2) continue;
        const w0 = localToWorld(line[0], fp);
        body += `${fmtCoord(w0.x)}${fmtCoordY(w0.y)}D02*\n`;
        for (let i = 1; i < line.length; i++) {
          const wp = localToWorld(line[i], fp);
          body += `${fmtCoord(wp.x)}${fmtCoordY(wp.y)}D01*\n`;
        }
      }
    } else {
      // 无定义时仍画参考标记
      body += `${fmtCoord(fp.position.x)}${fmtCoordY(fp.position.y)}D02*\n`;
      body += `${fmtCoord(fp.position.x + 24)}${fmtCoordY(fp.position.y)}D01*\n`;
    }
  }
  body += 'M02*\n';
  return { layerName: title, fileName, content: body };
}

function exportBoardOutline(doc: PcbDocument): GerberLayerFile {
  let body = gerberHeader('Edge Cuts');
  body += apertureCircle(10, Math.max(1, doc.boardOutline.width));
  body += 'D10*\n';
  const pts = doc.boardOutline.points;
  if (pts.length >= 2) {
    body += `${fmtCoord(pts[0].x)}${fmtCoordY(pts[0].y)}D02*\n`;
    for (let i = 1; i < pts.length; i++) {
      body += `${fmtCoord(pts[i].x)}${fmtCoordY(pts[i].y)}D01*\n`;
    }
    body += `${fmtCoord(pts[0].x)}${fmtCoordY(pts[0].y)}D01*\n`;
  }
  body += 'M02*\n';
  return { layerName: 'Edge.Cuts', fileName: 'Edge_Cuts.gbr', content: body };
}

function exportDrill(doc: PcbDocument): GerberLayerFile {
  let body = 'M48\n';
  body += 'METRIC,TZ\n';
  body += 'T1C0.30\n';
  body += '%\n';
  body += 'T1\n';
  for (const via of doc.vias) {
    const x = milToMm(via.position.x).toFixed(3);
    const y = milToMm(via.position.y).toFixed(3);
    body += `X${x}Y${y}\n`;
  }
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.drill || pad.drill <= 0) continue;
      const wp = padWorldPosition(fp, pad);
      const x = milToMm(wp.x).toFixed(3);
      const y = milToMm(wp.y).toFixed(3);
      body += `X${x}Y${y}\n`;
    }
  }
  body += 'M30\n';
  return { layerName: 'Drill', fileName: 'drill.txt', content: body };
}

/** 打包说明文本（工厂对照） */
function exportReadme(doc: PcbDocument, files: GerberLayerFile[]): GerberLayerFile {
  let body = `ElecDraw Gerber bundle for ${doc.name}\n`;
  body += `Copper layers: ${doc.layerStack.copperCount}\n`;
  body += `Units: mm (Gerber), drill metric\n\nFiles:\n`;
  for (const f of files) {
    body += ` - ${f.fileName} (${f.layerName})\n`;
  }
  return { layerName: 'README', fileName: 'README.txt', content: body };
}

export function exportPcbGerber(doc: PcbDocument): GerberExportResult {
  const files: GerberLayerFile[] = [];
  let copperIds = copperLayersFromStack(doc.layerStack);
  if (copperIds.length === 0) {
    copperIds = [PcbLayerId.F_CU, PcbLayerId.B_CU];
  }
  for (const id of copperIds) {
    const safe = id.replace('.', '_');
    files.push(exportCopperLayer(doc, id, `${safe}.gbr`, id));
  }
  files.push(exportMaskLayer(doc, true));
  files.push(exportMaskLayer(doc, false));
  files.push(exportPasteLayer(doc, true));
  files.push(exportPasteLayer(doc, false));
  files.push(exportSilkLayer(doc, true));
  files.push(exportSilkLayer(doc, false));
  files.push(exportBoardOutline(doc));
  files.push(exportDrill(doc));
  files.push(exportReadme(doc, files));
  return { files };
}
