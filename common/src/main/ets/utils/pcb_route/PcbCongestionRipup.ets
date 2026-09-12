/**
 * 拥塞区拆线重布：对未连通网拆除 bbox 内低优先级异网走线后重试。
 * 对齐路线图阶段一模块 D / 阶段二全局迭代。
 */
import { PcbDocument, PcbTrack } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { tracePcb } from '../PcbTraceLog';

function netPriority(doc: PcbDocument, netId: string): number {
  let name = netId;
  for (let i = 0; i < doc.nets.length; i++) {
    if (doc.nets[i].id === netId) {
      name = doc.nets[i].name;
      break;
    }
  }
  const nm = name.toUpperCase();
  if (nm === 'GND' || nm === 'VSS' || nm === 'AGND' || nm.indexOf('GND') >= 0) {
    return 100;
  }
  if (nm === 'VCC' || nm === 'VDD' || nm === 'VEE' || nm.indexOf('VCC') === 0 ||
    nm.indexOf('VDD') === 0 || nm.indexOf('VIN') === 0) {
    return 90;
  }
  if (nm.indexOf('XTAL') >= 0 || nm.indexOf('OSC') >= 0 || nm.indexOf('CLK') >= 0) {
    return 80;
  }
  // 差分 / 高速名启发
  if (nm.indexOf('USB') >= 0 || nm.indexOf('DIFF') >= 0 || nm.indexOf('_P') >= 0 ||
    nm.indexOf('_N') >= 0) {
    return 70;
  }
  return 50;
}

function trackMid(t: PcbTrack): Point2D {
  return { x: (t.start.x + t.end.x) * 0.5, y: (t.start.y + t.end.y) * 0.5 };
}

/**
 * 拆除与失败网端点包围盒相交、且优先级更低的异网走线。
 * @returns 被拆网络 id 列表（供上层重布）
 */
export function ripBlockingTracksForNets(
  doc: PcbDocument,
  failedNetIds: string[],
  pinA: Map<string, Point2D>,
  pinB: Map<string, Point2D>,
  maxRipTracks: number = 40
): string[] {
  const rippedNets: Set<string> = new Set();
  if (failedNetIds.length === 0) {
    return [];
  }

  let ripped = 0;
  const removeIds: Set<string> = new Set();

  for (let fi = 0; fi < failedNetIds.length; fi++) {
    const fid = failedNetIds[fi];
    const a = pinA.get(fid);
    const b = pinB.get(fid);
    if (a === undefined || b === undefined) {
      continue;
    }
    const pad = 40;
    const x1 = Math.min(a.x, b.x) - pad;
    const x2 = Math.max(a.x, b.x) + pad;
    const y1 = Math.min(a.y, b.y) - pad;
    const y2 = Math.max(a.y, b.y) + pad;
    const failPri = netPriority(doc, fid);

    // 候选：异网、优先级明显更低、中点在包围盒内；不拆短跳 LED 等易碎网
    const candidates: PcbTrack[] = [];
    for (let i = 0; i < doc.tracks.length; i++) {
      const t = doc.tracks[i];
      if (t.netId.length === 0 || t.netId === fid) {
        continue;
      }
      const pri = netPriority(doc, t.netId);
      // 需明显更低才拆，避免同级信号互撕（曾把已通的 L*_LED 拆毁）
      if (pri >= failPri - 5) {
        continue;
      }
      const tn = (t.netName || '').toUpperCase();
      if (tn.indexOf('LED') >= 0) {
        continue;
      }
      const m = trackMid(t);
      if (m.x < x1 || m.x > x2 || m.y < y1 || m.y > y2) {
        continue;
      }
      candidates.push(t);
    }
    // 短段优先拆（阻挡局部通道）
    candidates.sort((u: PcbTrack, v: PcbTrack) => {
      const lu = Math.hypot(u.end.x - u.start.x, u.end.y - u.start.y);
      const lv = Math.hypot(v.end.x - v.start.x, v.end.y - v.start.y);
      return lu - lv;
    });
    const take = Math.min(candidates.length, 8);
    for (let i = 0; i < take; i++) {
      removeIds.add(candidates[i].id);
      rippedNets.add(candidates[i].netId);
      ripped++;
      if (ripped >= maxRipTracks) {
        break;
      }
    }
    if (ripped >= maxRipTracks) {
      break;
    }
  }

  if (removeIds.size === 0) {
    return [];
  }
  const keep: PcbTrack[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    if (!removeIds.has(doc.tracks[i].id)) {
      keep.push(doc.tracks[i]);
    }
  }
  doc.tracks = keep;
  const out: string[] = [];
  rippedNets.forEach((nid: string) => {
    out.push(nid);
  });
  tracePcb('CONGEST_RIPUP',
    `failed=${failedNetIds.length} rippedTracks=${removeIds.size} rippedNets=${out.length}`);
  return out;
}
