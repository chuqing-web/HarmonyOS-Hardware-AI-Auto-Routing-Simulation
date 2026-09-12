/**
 * DFM 检查与轻量自动修复：板边、孔距、酸陷阱、丝印压焊盘、铜箔平衡、微孔提示。
 */
import {
  PcbDocument, PcbDrcSeverity, PcbDrcRuleType, PcbDrcViolation, PcbLayerId, PcbTrack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { chamferOrthoCorners } from './PcbCorner45';
import { tracePcb } from '../PcbTraceLog';

export function auditDfmRules(doc: PcbDocument): PcbDrcViolation[] {
  const out: PcbDrcViolation[] = [];
  const rules = doc.metadata.designRules;
  const edgeKeep = 75;
  const silkClr = rules.silkToPadClearance > 0 ? rules.silkToPadClearance : 8;

  const outline = doc.boardOutline?.points ?? [];
  if (outline.length >= 2) {
    let x1 = outline[0].x;
    let y1 = outline[0].y;
    let x2 = outline[0].x;
    let y2 = outline[0].y;
    for (let i = 1; i < outline.length; i++) {
      x1 = Math.min(x1, outline[i].x);
      y1 = Math.min(y1, outline[i].y);
      x2 = Math.max(x2, outline[i].x);
      y2 = Math.max(y2, outline[i].y);
    }
    for (let i = 0; i < doc.tracks.length; i++) {
      const t = doc.tracks[i];
      const mx = Math.min(t.start.x, t.end.x);
      const Mx = Math.max(t.start.x, t.end.x);
      const my = Math.min(t.start.y, t.end.y);
      const My = Math.max(t.start.y, t.end.y);
      if (mx < x1 + edgeKeep || Mx > x2 - edgeKeep || my < y1 + edgeKeep || My > y2 - edgeKeep) {
        out.push({
          id: IdUtil.generate('drc'),
          severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.EDGE_OPEN,
          message: `走线距板边过近: ${t.netName || t.netId}`,
          position: t.start,
          netId: t.netId
        });
      }
    }
  }

  const minHH = rules.minHoleToHole > 0 ? rules.minHoleToHole : rules.minViaDrill * 2;
  for (let i = 0; i < doc.vias.length; i++) {
    const via = doc.vias[i];
    // 微孔工艺提示
    if (via.drill > 0 && via.drill <= 6) {
      out.push({
        id: IdUtil.generate('drc'),
        severity: PcbDrcSeverity.WARNING,
        ruleType: PcbDrcRuleType.VIA_ANNULAR,
        message: `微孔提示 drill=${via.drill.toFixed(1)}mil（需激光/盘中孔工艺）`,
        position: via.position,
        netId: via.netId
      });
    }
    for (let j = i + 1; j < doc.vias.length; j++) {
      const b = doc.vias[j];
      const d = Math.hypot(via.position.x - b.position.x, via.position.y - b.position.y);
      const need = (via.drill + b.drill) * 0.5 + minHH;
      if (d < need) {
        out.push({
          id: IdUtil.generate('drc'),
          severity: PcbDrcSeverity.ERROR,
          ruleType: PcbDrcRuleType.VIA_ANNULAR,
          message: `过孔间距不足: ${d.toFixed(1)} < ${need.toFixed(1)}`,
          position: via.position,
          netId: via.netId
        });
      }
    }
  }

  // 酸陷阱锐角
  for (let i = 0; i < doc.tracks.length; i++) {
    const t1 = doc.tracks[i];
    for (let j = 0; j < doc.tracks.length; j++) {
      if (i === j || t1.netId !== doc.tracks[j].netId || t1.layer !== doc.tracks[j].layer) {
        continue;
      }
      const t2 = doc.tracks[j];
      if (Math.abs(t1.end.x - t2.start.x) >= 0.5 || Math.abs(t1.end.y - t2.start.y) >= 0.5) {
        continue;
      }
      const jx = t1.end.x;
      const jy = t1.end.y;
      const v1x = t1.start.x - jx;
      const v1y = t1.start.y - jy;
      const v2x = t2.end.x - jx;
      const v2y = t2.end.y - jy;
      const n1 = Math.hypot(v1x, v1y);
      const n2 = Math.hypot(v2x, v2y);
      if (n1 < 1 || n2 < 1) {
        continue;
      }
      const cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
      if (cos > 0.5) {
        out.push({
          id: IdUtil.generate('drc'),
          severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.KEEPOUT,
          message: `疑似酸陷阱锐角: ${t1.netName || t1.netId}`,
          position: { x: jx, y: jy },
          netId: t1.netId
        });
      }
    }
  }

  // 丝印压焊盘：位号中心距焊盘过近
  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const fp = doc.footprints[fi];
    const silkX = fp.position.x;
    const silkY = fp.position.y - 20;
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      const wp = padWorldPosition(fp, pad);
      const pr = Math.max(pad.size.x, pad.size.y) * 0.5;
      const d = Math.hypot(silkX - wp.x, silkY - wp.y);
      if (d < pr + silkClr) {
        out.push({
          id: IdUtil.generate('drc'),
          severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.SILK_PAD,
          message: `丝印可能压焊盘: ${fp.refDes} pad`,
          position: wp,
          footprintId: fp.id
        });
        break;
      }
    }
  }

  // 铜箔平衡：F/B 走线面积代理
  let areaF = 0;
  let areaB = 0;
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    const a = Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y) * t.width;
    if (t.layer === PcbLayerId.F_CU) {
      areaF += a;
    } else if (t.layer === PcbLayerId.B_CU) {
      areaB += a;
    }
  }
  const hi = Math.max(areaF, areaB);
  const lo = Math.max(1, Math.min(areaF, areaB));
  if (hi > lo * 3 && hi > 5000) {
    out.push({
      id: IdUtil.generate('drc'),
      severity: PcbDrcSeverity.WARNING,
      ruleType: PcbDrcRuleType.KEEPOUT,
      message: `铜箔不平衡: F=${areaF.toFixed(0)} B=${areaB.toFixed(0)}（走线面积代理）`,
      position: { x: 0, y: 0 }
    });
  }

  return out;
}

/**
 * 酸陷阱自动修：对锐角拐角做 45° 倒角（复用 chamfer）。
 */
export function fixAcidTrapCorners(doc: PcbDocument): number {
  const before = doc.tracks.length;
  const n = chamferOrthoCorners(doc, 3);
  if (n > 0) {
    tracePcb('DFM_ACID_FIX', `chamfers=${n} tracks=${before}→${doc.tracks.length}`);
  }
  return n;
}

/**
 * 可选：将过短斜段拉回正交（制造友好）；返回修改段数。
 */
export function normalizeTinyDiagonals(doc: PcbDocument, maxLen: number = 12): number {
  let fixed = 0;
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    const dx = Math.abs(t.end.x - t.start.x);
    const dy = Math.abs(t.end.y - t.start.y);
    if (dx < 0.5 || dy < 0.5) {
      continue;
    }
    const L = Math.hypot(dx, dy);
    if (L > maxLen) {
      continue;
    }
    const mid: Point2D = { x: t.end.x, y: t.start.y };
    const others: PcbTrack[] = [];
    for (let k = 0; k < doc.tracks.length; k++) {
      if (k !== i) {
        others.push(doc.tracks[k]);
      }
    }
    if (pathClearBlockReason(doc, t.layer, t.start, mid, t.netId, t.width, others, doc.vias) !== null) {
      continue;
    }
    if (pathClearBlockReason(doc, t.layer, mid, t.end, t.netId, t.width, others, doc.vias) !== null) {
      continue;
    }
    const layer = t.layer;
    const netId = t.netId;
    const netName = t.netName;
    const w = t.width;
    const a: Point2D = { x: t.start.x, y: t.start.y };
    const b: Point2D = { x: t.end.x, y: t.end.y };
    doc.tracks.splice(i, 1);
    doc.tracks.push({
      id: IdUtil.generate('trk'),
      layer,
      start: a,
      end: mid,
      width: w,
      netId,
      netName
    });
    doc.tracks.push({
      id: IdUtil.generate('trk'),
      layer,
      start: mid,
      end: b,
      width: w,
      netId,
      netName
    });
    fixed++;
  }
  return fixed;
}
