/**
 * 自动布线后验证与指标：clearance / DFM 环宽 / 最小线宽 + 布通率。
 */
import {
  PcbDocument, PcbDrcSeverity, PcbDrcRuleType, PcbDrcViolation, PcbTrack, PcbVia
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { buildRatsnest } from '../PcbNetUtil';
import { pathClearBlockReason } from './PcbClearanceOracle';
import { WireConflictGeometry } from '../WireConflictGeometry';
import { auditSignalIntegrity } from './PcbSiChecks';
import { auditDfmRules } from './PcbDfmChecks';

export interface AutoRouteMetrics {
  completionRate: number;
  totalWireLength: number;
  viaCount: number;
  trackCount: number;
  unroutedNets: number;
  routedNets: number;
  clearanceErrors: number;
  shortErrors: number;
  dfmErrors: number;
  siWarnings: number;
  drcErrorCount: number;
}

function pointDist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 端点最小距近似（与编辑器 DRC 一致，偏保守） */
function segEndpointMinDist(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
  return Math.min(
    pointDist(a1, b1), pointDist(a1, b2),
    pointDist(a2, b1), pointDist(a2, b2));
}

/** 轻量 DRC：同层异网短路/间距 + pathClear 抽检（排除自身段） */
export function auditRouteClearance(doc: PcbDocument, maxTrackPairs: number = 4000): PcbDrcViolation[] {
  const violations: PcbDrcViolation[] = [];
  const rules = doc.metadata.designRules;
  const tracks = doc.tracks;
  const pairCap = Math.min(tracks.length, Math.ceil(Math.sqrt(maxTrackPairs * 2)));

  for (let i = 0; i < tracks.length; i++) {
    const t1 = tracks[i];
    const others: PcbTrack[] = [];
    for (let k = 0; k < tracks.length; k++) {
      if (k !== i) {
        others.push(tracks[k]);
      }
    }
    const reason = pathClearBlockReason(
      doc, t1.layer, t1.start, t1.end, t1.netId, t1.width, others, doc.vias);
    if (reason !== null && (reason.indexOf('pad') >= 0 || reason.indexOf('body') >= 0)) {
      const vPad: PcbDrcViolation = {
        id: IdUtil.generate('drc'),
        severity: PcbDrcSeverity.ERROR,
        ruleType: PcbDrcRuleType.CLEARANCE,
        message: `走线 clearance: ${t1.netName || t1.netId} (${reason})`,
        position: t1.start,
        netId: t1.netId
      };
      violations.push(vPad);
    }
    const jMax = Math.min(tracks.length, i + 1 + pairCap);
    for (let j = i + 1; j < jMax; j++) {
      const t2 = tracks[j];
      if (t1.layer !== t2.layer) {
        continue;
      }
      if (t1.netId.length > 0 && t1.netId === t2.netId) {
        continue;
      }
      const cross = WireConflictGeometry.segmentConflict(t1.start, t1.end, t2.start, t2.end);
      const d = segEndpointMinDist(t1.start, t1.end, t2.start, t2.end);
      if (cross !== 'none' || d < 0.5) {
        const vShort: PcbDrcViolation = {
          id: IdUtil.generate('drc'),
          severity: PcbDrcSeverity.ERROR,
          ruleType: PcbDrcRuleType.SHORT,
          message: `短路: ${t1.netName || '?'} / ${t2.netName || '?'}`,
          position: t1.start,
          netId: t1.netId
        };
        violations.push(vShort);
      } else if (d < rules.minClearance) {
        const vClr: PcbDrcViolation = {
          id: IdUtil.generate('drc'),
          severity: PcbDrcSeverity.ERROR,
          ruleType: PcbDrcRuleType.CLEARANCE,
          message: `间距: ${t1.netName || '?'} / ${t2.netName || '?'} (${d.toFixed(1)}mil)`,
          position: t1.start,
          netId: t1.netId
        };
        violations.push(vClr);
      }
    }
  }
  return violations;
}

/** DFM：过孔环宽 + 最小线宽 + 板边/孔距/锐角（阶段四子集） */
export function auditRouteDfm(doc: PcbDocument): PcbDrcViolation[] {
  const violations: PcbDrcViolation[] = [];
  const rules = doc.metadata.designRules;
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    if (t.width + 0.05 < rules.minTrackWidth) {
      const v: PcbDrcViolation = {
        id: IdUtil.generate('drc'),
        severity: PcbDrcSeverity.WARNING,
        ruleType: PcbDrcRuleType.MIN_WIDTH,
        message: `线宽 ${t.width.toFixed(1)} < 最小 ${rules.minTrackWidth}`,
        position: t.start,
        netId: t.netId
      };
      violations.push(v);
    }
  }
  for (let i = 0; i < doc.vias.length; i++) {
    const via: PcbVia = doc.vias[i];
    const ring = (via.diameter - via.drill) * 0.5;
    if (ring + 0.05 < rules.minAnnularRing) {
      const v: PcbDrcViolation = {
        id: IdUtil.generate('drc'),
        severity: PcbDrcSeverity.ERROR,
        ruleType: PcbDrcRuleType.VIA_ANNULAR,
        message: `过孔环宽 ${ring.toFixed(1)} < 最小 ${rules.minAnnularRing}`,
        position: via.position,
        netId: via.netId
      };
      violations.push(v);
    }
  }
  const extra = auditDfmRules(doc);
  for (let i = 0; i < extra.length; i++) {
    violations.push(extra[i]);
  }
  return violations;
}

export function computeAutoRouteMetrics(
  doc: PcbDocument,
  attemptedNets: number,
  tracksAdded: number,
  viasAdded: number
): AutoRouteMetrics {
  const rats = buildRatsnest(doc);
  const unrouted: Set<string> = new Set();
  for (let i = 0; i < rats.length; i++) {
    unrouted.add(rats[i].netId);
  }
  let wire = 0;
  for (let i = 0; i < doc.tracks.length; i++) {
    const t: PcbTrack = doc.tracks[i];
    wire += Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
  }
  const vios = auditRouteClearance(doc);
  const dfm = auditRouteDfm(doc);
  const si = auditSignalIntegrity(doc);
  let clearance = 0;
  let shorts = 0;
  for (let i = 0; i < vios.length; i++) {
    if (vios[i].ruleType === PcbDrcRuleType.SHORT) {
      shorts++;
    } else if (vios[i].ruleType === PcbDrcRuleType.CLEARANCE) {
      clearance++;
    }
  }
  // 布通率按「多焊盘网」计：attempted 可能因误跳过偏小，且 unrouted 可大于 attempted
  const padCountByNet: Map<string, number> = new Map();
  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const pads = doc.footprints[fi].pads;
    for (let pi = 0; pi < pads.length; pi++) {
      const nid = pads[pi].netId ?? '';
      if (nid.length === 0) {
        continue;
      }
      padCountByNet.set(nid, (padCountByNet.get(nid) ?? 0) + 1);
    }
  }
  let multiPadNets = 0;
  padCountByNet.forEach((cnt: number) => {
    if (cnt >= 2) {
      multiPadNets++;
    }
  });
  const totalNets = Math.max(multiPadNets, attemptedNets, unrouted.size);
  const routed = Math.max(0, totalNets - unrouted.size);
  const completion = totalNets > 0 ? routed / totalNets : 1;
  const m: AutoRouteMetrics = {
    completionRate: completion,
    totalWireLength: wire,
    viaCount: viasAdded,
    trackCount: tracksAdded,
    unroutedNets: unrouted.size,
    routedNets: routed,
    clearanceErrors: clearance,
    shortErrors: shorts,
    dfmErrors: dfm.length,
    siWarnings: si.violations.length,
    drcErrorCount: clearance + shorts + dfm.length
  };
  return m;
}
