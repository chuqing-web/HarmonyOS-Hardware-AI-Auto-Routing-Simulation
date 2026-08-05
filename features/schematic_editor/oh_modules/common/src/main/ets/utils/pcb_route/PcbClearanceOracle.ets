/**
 * 简易 clearance 查询 — 供几何引擎避障（不替代完整 DRC）
 * 覆盖：异网同层 track + via 圆 + 异网焊盘近似圆
 */
import { PcbDocument, PcbLayerId, PcbTrack, PcbVia } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { findNetClass } from '../PcbNetUtil';
import { padWorldPosition } from '../PcbZoneUtil';

function distPointSeg(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < 0) {
    t = 0;
  } else if (t > 1) {
    t = 1;
  }
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  const ex = p.x - qx;
  const ey = p.y - qy;
  return Math.sqrt(ex * ex + ey * ey);
}

function segClearance(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
  return Math.min(
    distPointSeg(a1, b1, b2), distPointSeg(a2, b1, b2),
    distPointSeg(b1, a1, a2), distPointSeg(b2, a1, a2)
  );
}

export function clearanceForNet(doc: PcbDocument, netId: string): number {
  const base = doc.metadata.designRules.minClearance;
  if (netId.length === 0) {
    return base;
  }
  for (const n of doc.nets) {
    if (n.id === netId) {
      return findNetClass(doc, n.classId).clearance;
    }
  }
  return base;
}

export function trackWidthForNet(doc: PcbDocument, netId: string): number {
  const base = doc.metadata.designRules.defaultTrackWidth;
  if (netId.length === 0) {
    return base;
  }
  for (const n of doc.nets) {
    if (n.id === netId) {
      return findNetClass(doc, n.classId).trackWidth;
    }
  }
  return base;
}

function viaOnLayer(v: PcbVia, layer: PcbLayerId): boolean {
  if (!v.layers || v.layers.length === 0) {
    return true;
  }
  return v.layers.indexOf(layer) >= 0;
}

/** 阻挡原因；null = 畅通 */
export function pathClearBlockReason(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number,
  existing: PcbTrack[],
  existingVias?: PcbVia[]
): string | null {
  const need = clearanceForNet(doc, netId) + width / 2;
  for (let i = 0; i < existing.length; i++) {
    const t = existing[i];
    if (t.layer !== layer) {
      continue;
    }
    if (t.netId === netId && netId.length > 0) {
      continue;
    }
    if (segClearance(a, b, t.start, t.end) < need + t.width / 2) {
      return `track_block net=${t.netName || t.netId} on ${layer as string}` +
        ` @(${Math.round(t.start.x)},${Math.round(t.start.y)})-(${Math.round(t.end.x)},${Math.round(t.end.y)})`;
    }
  }
  if (existingVias) {
    for (let i = 0; i < existingVias.length; i++) {
      const v = existingVias[i];
      if (!viaOnLayer(v, layer)) {
        continue;
      }
      if (v.netId === netId && netId.length > 0) {
        continue;
      }
      if (distPointSeg(v.position, a, b) < need + v.diameter / 2) {
        return `via_block net=${v.netName || v.netId} @(${Math.round(v.position.x)},${Math.round(v.position.y)})`;
      }
    }
  }
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      const pNet = pad.netId ?? '';
      if (pNet.length > 0 && pNet === netId) {
        continue;
      }
      // 异网焊盘对所有铜层构成障碍：禁止在对层从 SMD 焊盘正下方穿过，
      // 否则同网落 via/贴盘时会与已有铜短路（Cu=2 常见致命问题）。
      const pos = padWorldPosition(fp, pad);
      const padR = Math.max(pad.size.x, pad.size.y) / 2;
      // float 焊盘（未绑网）仍挡线，但用缩小半径，减轻 sch→pcb 大量 unbound 的误杀
      const effectiveR = pNet.length === 0 ? padR * 0.55 : padR;
      const thr = need + effectiveR;
      // 端点邻域放行：密集布局下邻脚间距常 < clearance，否则焊盘无法出线
      const da = Math.sqrt((pos.x - a.x) * (pos.x - a.x) + (pos.y - a.y) * (pos.y - a.y));
      const db = Math.sqrt((pos.x - b.x) * (pos.x - b.x) + (pos.y - b.y) * (pos.y - b.y));
      if (da < thr || db < thr) {
        continue;
      }
      if (distPointSeg(pos, a, b) < thr) {
        return `pad_block ${fp.refDes}.${pad.number}` +
          `(${pad.netName || pNet || 'float'})@${Math.round(pos.x)},${Math.round(pos.y)}` +
          ` r=${Math.round(effectiveR)} layer=${layer as string}`;
      }
    }
  }
  return null;
}

/** 候选线段与已有异网同层走线 / via / 焊盘是否冲突 */
export function pathClearOfTracks(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number,
  existing: PcbTrack[],
  existingVias?: PcbVia[]
): boolean {
  return pathClearBlockReason(doc, layer, a, b, netId, width, existing, existingVias) === null;
}

/** via 中心是否与异网 via/pad/track 冲突 */
export function viaClearAt(
  doc: PcbDocument,
  pos: Point2D,
  netId: string,
  diameter: number,
  layers: PcbLayerId[],
  existingTracks: PcbTrack[],
  existingVias: PcbVia[]
): boolean {
  const need = clearanceForNet(doc, netId) + diameter / 2;
  for (let i = 0; i < existingVias.length; i++) {
    const v = existingVias[i];
    if (v.netId === netId && netId.length > 0) {
      continue;
    }
    const dx = v.position.x - pos.x;
    const dy = v.position.y - pos.y;
    if (Math.sqrt(dx * dx + dy * dy) < need + v.diameter / 2) {
      return false;
    }
  }
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    for (let i = 0; i < existingTracks.length; i++) {
      const t = existingTracks[i];
      if (t.layer !== layer) {
        continue;
      }
      if (t.netId === netId && netId.length > 0) {
        continue;
      }
      if (distPointSeg(pos, t.start, t.end) < need + t.width / 2) {
        return false;
      }
    }
  }
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      const pNet = pad.netId ?? '';
      if (pNet.length > 0 && pNet === netId) {
        continue;
      }
      const posPad = padWorldPosition(fp, pad);
      const padR = Math.max(pad.size.x, pad.size.y) / 2;
      const effectiveR = pNet.length === 0 ? padR * 0.55 : padR;
      const dx = posPad.x - pos.x;
      const dy = posPad.y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < need + effectiveR) {
        return false;
      }
    }
  }
  return true;
}
