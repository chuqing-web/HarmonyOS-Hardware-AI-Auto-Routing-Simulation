/**
 * 布线后处理：同网正交阶梯 L 捷径，缩短总线长并减少拐点。
 * 用端点邻接代替全量 O(n²)；带墙钟预算，避免主线程静默数秒～数十秒。
 */
import { PcbDocument, PcbTrack } from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { pathClearBlockReason } from './PcbClearanceOracle';

/** 单次 cleanup 内 shorten 硬墙（ms）；超时提前结束 */
const SHORTEN_WALL_MS = 220;
const SHORTEN_SLICE_MS = 8;

function almostEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

function isOrtho(a: Point2D, b: Point2D): boolean {
  return almostEq(a.x, b.x) || almostEq(a.y, b.y);
}

function segLength(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function sameEndpoint(a: Point2D, b: Point2D): boolean {
  return almostEq(a.x, b.x) && almostEq(a.y, b.y);
}

function endpointKey(p: Point2D): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

function yieldShorten(): Promise<void> {
  return new Promise<void>((resolve: (v: void) => void) => {
    setTimeout((): void => {
      resolve();
    }, 0);
  });
}

/**
 * 尝试把首尾相接的正交阶梯 t1/t2 换成更短 L。
 * 同网线段在 clearance 中本就跳过，可直接传 doc.tracks，避免每次拷贝。
 */
function tryShortenStairPair(doc: PcbDocument, t1: PcbTrack, t2: PcbTrack): boolean {
  let joint: Point2D | null = null;
  let a: Point2D | null = null;
  let b: Point2D | null = null;
  if (sameEndpoint(t1.end, t2.start)) {
    joint = t1.end;
    a = t1.start;
    b = t2.end;
  } else if (sameEndpoint(t1.end, t2.end)) {
    joint = t1.end;
    a = t1.start;
    b = t2.start;
  } else if (sameEndpoint(t1.start, t2.start)) {
    joint = t1.start;
    a = t1.end;
    b = t2.end;
  } else if (sameEndpoint(t1.start, t2.end)) {
    joint = t1.start;
    a = t1.end;
    b = t2.start;
  }
  if (joint === null || a === null || b === null) {
    return false;
  }
  const h1 = almostEq(a.y, joint.y);
  const h2 = almostEq(joint.y, b.y);
  if (h1 === h2) {
    return false;
  }
  const oldLen = segLength(a, joint) + segLength(joint, b);
  const midH: Point2D = { x: b.x, y: a.y };
  const midV: Point2D = { x: a.x, y: b.y };
  const cands: Point2D[][] = [];
  if (almostEq(a.x, b.x) || almostEq(a.y, b.y)) {
    cands.push([a, b]);
  } else {
    cands.push([a, midH, b]);
    cands.push([a, midV, b]);
  }

  let bestPath: Point2D[] | null = null;
  let bestLen = oldLen - 0.5;
  for (let c = 0; c < cands.length; c++) {
    const path = cands[c];
    let len = 0;
    let blocked = false;
    for (let p = 0; p < path.length - 1; p++) {
      len += segLength(path[p], path[p + 1]);
      const reason = pathClearBlockReason(
        doc, t1.layer, path[p], path[p + 1], t1.netId, t1.width,
        doc.tracks, doc.vias);
      if (reason !== null) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      continue;
    }
    if (len < bestLen) {
      bestLen = len;
      bestPath = path;
    }
  }
  if (bestPath === null) {
    return false;
  }

  const keepMeta = t1;
  const nextTracks: PcbTrack[] = [];
  for (let k = 0; k < doc.tracks.length; k++) {
    const id = doc.tracks[k].id;
    if (id === t1.id || id === t2.id) {
      continue;
    }
    nextTracks.push(doc.tracks[k]);
  }
  for (let p = 0; p < bestPath.length - 1; p++) {
    if (segLength(bestPath[p], bestPath[p + 1]) < 0.5) {
      continue;
    }
    const nt: PcbTrack = {
      id: IdUtil.generate('trk'),
      start: { x: bestPath[p].x, y: bestPath[p].y },
      end: { x: bestPath[p + 1].x, y: bestPath[p + 1].y },
      width: keepMeta.width,
      layer: keepMeta.layer,
      netId: keepMeta.netId,
      netName: keepMeta.netName
    };
    nextTracks.push(nt);
  }
  doc.tracks = nextTracks;
  return true;
}

interface ShortenGroupMaps {
  groups: Map<string, number[]>;
  groupKeys: string[];
}

function buildShortenGroups(tracks: PcbTrack[]): ShortenGroupMaps {
  const groups: Map<string, number[]> = new Map();
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.netId.length === 0 || !isOrtho(t.start, t.end)) {
      continue;
    }
    const gk = `${t.netId}|${t.layer as string}`;
    let arr = groups.get(gk);
    if (arr === undefined) {
      arr = [];
      groups.set(gk, arr);
    }
    arr.push(i);
  }
  const groupKeys: string[] = [];
  groups.forEach((_v: number[], k: string) => {
    groupKeys.push(k);
  });
  return { groups, groupKeys };
}

function buildEndpointAdj(tracks: PcbTrack[], idxs: number[]): Map<string, number[]> {
  const byEnd: Map<string, number[]> = new Map();
  for (let ii = 0; ii < idxs.length; ii++) {
    const ti = idxs[ii];
    const t = tracks[ti];
    const ks = endpointKey(t.start);
    const ke = endpointKey(t.end);
    let ls = byEnd.get(ks);
    if (ls === undefined) {
      ls = [];
      byEnd.set(ks, ls);
    }
    ls.push(ti);
    let le = byEnd.get(ke);
    if (le === undefined) {
      le = [];
      byEnd.set(ke, le);
    }
    le.push(ti);
  }
  return byEnd;
}

/**
 * 两段同层同网首尾相接的阶梯 → 尝试更短 L。
 * 端点邻接 + 墙钟；默认 1 pass。
 */
export function shortenOrthoStairs(doc: PcbDocument, maxPasses: number = 1,
  wallMs: number = SHORTEN_WALL_MS): number {
  const t0 = Date.now();
  const passes = Math.max(1, Math.min(maxPasses, 2));
  let replaced = 0;

  for (let pass = 0; pass < passes; pass++) {
    if (Date.now() - t0 >= wallMs) {
      break;
    }
    const tracks = doc.tracks;
    const maps = buildShortenGroups(tracks);
    let passHits = 0;
    let rebuild = false;

    for (let gi = 0; gi < maps.groupKeys.length && !rebuild; gi++) {
      if (Date.now() - t0 >= wallMs) {
        return replaced;
      }
      const idxs = maps.groups.get(maps.groupKeys[gi]);
      if (idxs === undefined || idxs.length < 2) {
        continue;
      }
      const byEnd = buildEndpointAdj(tracks, idxs);
      const used: Set<string> = new Set();

      for (let ii = 0; ii < idxs.length && !rebuild; ii++) {
        if (Date.now() - t0 >= wallMs) {
          return replaced;
        }
        const i = idxs[ii];
        const t1 = tracks[i];
        if (used.has(t1.id)) {
          continue;
        }
        const ends = [endpointKey(t1.start), endpointKey(t1.end)];
        for (let e = 0; e < ends.length && !rebuild; e++) {
          const neigh = byEnd.get(ends[e]);
          if (neigh === undefined) {
            continue;
          }
          for (let ni = 0; ni < neigh.length; ni++) {
            const j = neigh[ni];
            if (j === i) {
              continue;
            }
            const t2 = tracks[j];
            if (used.has(t2.id) || t2.id === t1.id) {
              continue;
            }
            if (!isOrtho(t2.start, t2.end)) {
              continue;
            }
            if (tryShortenStairPair(doc, t1, t2)) {
              used.add(t1.id);
              used.add(t2.id);
              passHits++;
              replaced++;
              rebuild = true;
              break;
            }
          }
        }
      }
    }
    if (passHits === 0) {
      break;
    }
  }
  return replaced;
}

/**
 * 协作式 shorten：墙内切片让出；超时提前结束。
 */
export async function shortenOrthoStairsAsync(doc: PcbDocument, maxPasses: number = 1,
  wallMs: number = SHORTEN_WALL_MS): Promise<number> {
  const t0 = Date.now();
  const passes = Math.max(1, Math.min(maxPasses, 2));
  let replaced = 0;
  let sliceStart = t0;

  for (let pass = 0; pass < passes; pass++) {
    if (Date.now() - t0 >= wallMs) {
      break;
    }
    const tracks = doc.tracks;
    const maps = buildShortenGroups(tracks);
    let passHits = 0;
    let rebuild = false;

    for (let gi = 0; gi < maps.groupKeys.length && !rebuild; gi++) {
      if (Date.now() - t0 >= wallMs) {
        return replaced;
      }
      const idxs = maps.groups.get(maps.groupKeys[gi]);
      if (idxs === undefined || idxs.length < 2) {
        continue;
      }
      const byEnd = buildEndpointAdj(tracks, idxs);
      const used: Set<string> = new Set();

      for (let ii = 0; ii < idxs.length && !rebuild; ii++) {
        if (Date.now() - t0 >= wallMs) {
          return replaced;
        }
        if (Date.now() - sliceStart >= SHORTEN_SLICE_MS) {
          await yieldShorten();
          sliceStart = Date.now();
        }
        const i = idxs[ii];
        if (i >= doc.tracks.length) {
          rebuild = true;
          break;
        }
        const t1 = doc.tracks[i];
        if (used.has(t1.id) || t1.netId.length === 0 || !isOrtho(t1.start, t1.end)) {
          continue;
        }
        const ends = [endpointKey(t1.start), endpointKey(t1.end)];
        for (let e = 0; e < ends.length && !rebuild; e++) {
          const neigh = byEnd.get(ends[e]);
          if (neigh === undefined) {
            continue;
          }
          for (let ni = 0; ni < neigh.length; ni++) {
            const j = neigh[ni];
            if (j === i || j >= doc.tracks.length) {
              continue;
            }
            const t2 = doc.tracks[j];
            if (used.has(t2.id) || t2.id === t1.id ||
              t2.netId !== t1.netId || t2.layer !== t1.layer) {
              continue;
            }
            if (!isOrtho(t2.start, t2.end)) {
              continue;
            }
            if (tryShortenStairPair(doc, t1, t2)) {
              used.add(t1.id);
              used.add(t2.id);
              passHits++;
              replaced++;
              rebuild = true;
              break;
            }
          }
        }
      }
    }
    if (passHits === 0) {
      break;
    }
    await yieldShorten();
    sliceStart = Date.now();
  }
  return replaced;
}
