/**
 * 覆铜区几何与挖空/热焊盘计算
 */
import {
  PcbDocument, PcbFootprintInst, PcbPad, PcbZone
} from '../types/PcbTypes';
import { Point2D } from '../types/CommonTypes';

export interface PcbZoneDefaultFields {
  clearance: number;
  thermalRelief: boolean;
  thermalGap: number;
  thermalWidth: number;
}

export function padWorldPosition(fp: PcbFootprintInst, pad: PcbPad): Point2D {
  let lx = pad.pos.x;
  let ly = pad.pos.y;
  if (fp.rotation === 90) { const t = lx; lx = -ly; ly = t; }
  else if (fp.rotation === 180) { lx = -lx; ly = -ly; }
  else if (fp.rotation === 270) { const t = lx; lx = ly; ly = -t; }
  const pt: Point2D = { x: fp.position.x + lx, y: fp.position.y + ly };
  return pt;
}

export function makeRectCutout(center: Point2D, halfW: number, halfH: number): Point2D[] {
  return [
    { x: center.x - halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y + halfH },
    { x: center.x - halfW, y: center.y + halfH }
  ];
}

export function pointInPolygon(p: Point2D, poly: Point2D[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi: Point2D = poly[i];
    const pj: Point2D = poly[j];
    const xi = pi.x;
    const yi = pi.y;
    const xj = pj.x;
    const yj = pj.y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function normalizeZoneFields(zone: PcbZone, doc: PcbDocument): void {
  if (!zone.cutouts) zone.cutouts = [];
  if (!zone.manualCutouts) zone.manualCutouts = [];
  if (zone.clearance === undefined || zone.clearance <= 0) {
    zone.clearance = doc.metadata.designRules.minClearance;
  }
  if (zone.thermalRelief === undefined) zone.thermalRelief = true;
  if (zone.thermalGap === undefined || zone.thermalGap <= 0) zone.thermalGap = 12;
  if (zone.thermalWidth === undefined || zone.thermalWidth <= 0) zone.thermalWidth = 10;
  if (zone.priority === undefined) zone.priority = 0;
}

/** 根据焊盘网络/热焊盘规则重建覆铜挖空 */
export function rebuildZoneCutouts(zone: PcbZone, doc: PcbDocument): void {
  normalizeZoneFields(zone, doc);
  const autoCutouts: Point2D[][] = [];
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      const wx = padWorldPosition(fp, pad);
      const hw = Math.max(pad.size.x, 10) / 2;
      const hh = Math.max(pad.size.y, 10) / 2;
      const sameNet = pad.netId !== undefined && pad.netId.length > 0 && pad.netId === zone.netId;
      if (!sameNet) {
        const gap = zone.clearance + Math.max(hw, hh);
        autoCutouts.push(makeRectCutout(wx, hw + gap, hh + gap));
      } else if (zone.thermalRelief) {
        autoCutouts.push(makeRectCutout(wx, hw + zone.thermalGap, hh + zone.thermalGap));
      }
    }
  }
  zone.cutouts = [];
  for (const c of zone.manualCutouts) {
    zone.cutouts.push(c);
  }
  for (const c of autoCutouts) {
    zone.cutouts.push(c);
  }
}

export function defaultZoneFields(doc: PcbDocument): PcbZoneDefaultFields {
  const fields: PcbZoneDefaultFields = {
    clearance: doc.metadata.designRules.minClearance,
    thermalRelief: true,
    thermalGap: 12,
    thermalWidth: 10
  };
  return fields;
}
