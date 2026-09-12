/**
 * 轻量信号完整性门禁：残桩、单网过孔过多、阻抗线宽偏离。
 * 非全波 SI，作为布线后验证增强。
 */
import { PcbDocument, PcbDrcSeverity, PcbDrcRuleType, PcbDrcViolation, PcbTrack } from '../../types/PcbTypes';
import { IdUtil } from '../IdUtil';
import { suggestedWidth50Ohm } from './PcbImpedanceRules';
import { isDiffPairNet, trackLengthOnNet } from './PcbDiffPairRouter';

export interface SiAuditStats {
  stubWarnings: number;
  viaStormWarnings: number;
  impedanceWarnings: number;
  violations: PcbDrcViolation[];
}

function isPowerLike(name: string): boolean {
  const nm = name.toUpperCase();
  return nm === 'GND' || nm === 'VSS' || nm === 'VCC' || nm === 'VDD' ||
    nm.indexOf('VCC') === 0 || nm.indexOf('VDD') === 0 || nm.indexOf('VIN') === 0;
}

/** 极短孤立段视为残桩（两端不接同网其他铜） */
function isLikelyStub(doc: PcbDocument, t: PcbTrack): boolean {
  const len = Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y);
  if (len > 25 || len < 0.5) {
    return false;
  }
  let touchStart = 0;
  let touchEnd = 0;
  for (let i = 0; i < doc.tracks.length; i++) {
    const o = doc.tracks[i];
    if (o.id === t.id || o.netId !== t.netId) {
      continue;
    }
    if (Math.hypot(o.start.x - t.start.x, o.start.y - t.start.y) < 1 ||
      Math.hypot(o.end.x - t.start.x, o.end.y - t.start.y) < 1) {
      touchStart++;
    }
    if (Math.hypot(o.start.x - t.end.x, o.start.y - t.end.y) < 1 ||
      Math.hypot(o.end.x - t.end.x, o.end.y - t.end.y) < 1) {
      touchEnd++;
    }
  }
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    if (v.netId !== t.netId) {
      continue;
    }
    if (Math.hypot(v.position.x - t.start.x, v.position.y - t.start.y) < v.diameter) {
      touchStart++;
    }
    if (Math.hypot(v.position.x - t.end.x, v.position.y - t.end.y) < v.diameter) {
      touchEnd++;
    }
  }
  return (touchStart === 0 && touchEnd > 0) || (touchEnd === 0 && touchStart > 0);
}

export function auditSignalIntegrity(doc: PcbDocument): SiAuditStats {
  const violations: PcbDrcViolation[] = [];
  let stubs = 0;
  let viaStorm = 0;
  let zWarn = 0;

  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    if (t.netId.length === 0 || isPowerLike(t.netName)) {
      continue;
    }
    if (isLikelyStub(doc, t)) {
      stubs++;
      violations.push({
        id: IdUtil.generate('drc'),
        severity: PcbDrcSeverity.WARNING,
        ruleType: PcbDrcRuleType.CLEARANCE,
        message: `疑似残桩: ${t.netName || t.netId} len=${Math.hypot(t.end.x - t.start.x, t.end.y - t.start.y).toFixed(1)}`,
        position: t.start,
        netId: t.netId
      });
    }
    if (!isDiffPairNet(doc, t.netId)) {
      const sug = suggestedWidth50Ohm(doc, t.layer);
      if (Math.abs(t.width - sug) > sug * 0.45 && t.width < sug * 0.55) {
        zWarn++;
        violations.push({
          id: IdUtil.generate('drc'),
          severity: PcbDrcSeverity.WARNING,
          ruleType: PcbDrcRuleType.MIN_WIDTH,
          message: `阻抗线宽偏离: ${t.netName || t.netId} w=${t.width.toFixed(1)} sug≈${sug.toFixed(1)}`,
          position: t.start,
          netId: t.netId
        });
      }
    }
  }

  const viaByNet: Map<string, number> = new Map();
  for (let i = 0; i < doc.vias.length; i++) {
    const nid = doc.vias[i].netId;
    if (nid.length === 0) {
      continue;
    }
    viaByNet.set(nid, (viaByNet.get(nid) ?? 0) + 1);
  }
  viaByNet.forEach((cnt: number, nid: string) => {
    let name = nid;
    for (let i = 0; i < doc.nets.length; i++) {
      if (doc.nets[i].id === nid) {
        name = doc.nets[i].name;
        break;
      }
    }
    if (isPowerLike(name)) {
      return;
    }
    const wire = trackLengthOnNet(doc, nid);
    // 短网却很多过孔
    if (cnt >= 4 && wire < 800) {
      viaStorm++;
      violations.push({
        id: IdUtil.generate('drc'),
        severity: PcbDrcSeverity.WARNING,
        ruleType: PcbDrcRuleType.VIA_ANNULAR,
        message: `过孔偏多: ${name} vias=${cnt} wire=${wire.toFixed(0)}`,
        netId: nid
      });
    }
  });

  return {
    stubWarnings: stubs,
    viaStormWarnings: viaStorm,
    impedanceWarnings: zWarn,
    violations
  };
}
