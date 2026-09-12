/**
 * BGA/面阵封装狗骨扇出：内圈焊盘向外打 fanout via，释放内层逃逸通道。
 */
import {
  PcbDocument, PcbFootprintInst, PcbPadType, PcbVia, PcbViaKind,
  copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { viaClearAt } from './PcbClearanceOracle';
import { findNetClass } from '../PcbNetUtil';
import { tracePcb } from '../PcbTraceLog';

export interface BgaFanoutResult {
  viasAdded: number;
  stubsAdded: number;
  footprints: number;
}

function uniqueCoords(vals: number[], eps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    let hit = false;
    for (let j = 0; j < out.length; j++) {
      if (Math.abs(out[j] - vals[i]) < eps) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      out.push(vals[i]);
    }
  }
  return out;
}

/**
 * 面阵（BGA）判据：焊盘≥16、行列各≥4，且近似填满网格、含内芯焊盘。
 * 仅用行列数会把 QFP/QFN 外圈焊盘误判为 BGA，进而打狗骨过孔堵死逃逸。
 */
export function isBgaLikeFootprint(fp: PcbFootprintInst, minPads: number = 16): boolean {
  if (fp.pads.length < minPads) {
    return false;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < fp.pads.length; i++) {
    xs.push(fp.pads[i].pos.x);
    ys.push(fp.pads[i].pos.y);
  }
  const ux = uniqueCoords(xs, 1);
  const uy = uniqueCoords(ys, 1);
  if (ux.length < 4 || uy.length < 4) {
    return false;
  }
  // QFP48≈0.14 填充；真 BGA 通常 ≥0.5
  const fill = fp.pads.length / (ux.length * uy.length);
  if (fill < 0.5) {
    return false;
  }
  let minX = ux[0];
  let maxX = ux[0];
  let minY = uy[0];
  let maxY = uy[0];
  for (let i = 1; i < ux.length; i++) {
    if (ux[i] < minX) {
      minX = ux[i];
    }
    if (ux[i] > maxX) {
      maxX = ux[i];
    }
  }
  for (let i = 1; i < uy.length; i++) {
    if (uy[i] < minY) {
      minY = uy[i];
    }
    if (uy[i] > maxY) {
      maxY = uy[i];
    }
  }
  let interior = 0;
  for (let i = 0; i < fp.pads.length; i++) {
    const p = fp.pads[i];
    const onEdgeX = Math.abs(p.pos.x - minX) < 1 || Math.abs(p.pos.x - maxX) < 1;
    const onEdgeY = Math.abs(p.pos.y - minY) < 1 || Math.abs(p.pos.y - maxY) < 1;
    if (!onEdgeX && !onEdgeY) {
      interior++;
    }
  }
  // 至少一圈内芯（排除纯外圈 QFP/QFN）
  return interior >= 4;
}

function footprintCentroidLocal(fp: PcbFootprintInst): Point2D {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < fp.pads.length; i++) {
    sx += fp.pads[i].pos.x;
    sy += fp.pads[i].pos.y;
  }
  const n = Math.max(fp.pads.length, 1);
  return { x: sx / n, y: sy / n };
}

function estimatePitch(fp: PcbFootprintInst): number {
  const rawX: number[] = [];
  for (let i = 0; i < fp.pads.length; i++) {
    rawX.push(fp.pads[i].pos.x);
  }
  const xs = uniqueCoords(rawX, 1);
  xs.sort((a: number, b: number) => a - b);
  let minDx = Number.POSITIVE_INFINITY;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 5 && d < minDx) {
      minDx = d;
    }
  }
  if (!(minDx < Number.POSITIVE_INFINITY)) {
    return 40;
  }
  return minDx;
}

/**
 * 对 BGA-like 封装的非外圈焊盘：沿远离质心方向做狗骨 stub + via。
 * 外圈直接留给 escape 走线。
 */
export function applyBgaDogboneFanout(doc: PcbDocument): BgaFanoutResult {
  const copper = copperLayersFromStack(doc.layerStack);
  if (copper.length < 2) {
    return { viasAdded: 0, stubsAdded: 0, footprints: 0 };
  }
  const top = copper[0];
  const grid = doc.metadata.gridSize ?? 5;
  let viasAdded = 0;
  let stubsAdded = 0;
  let fpCount = 0;

  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const fp = doc.footprints[fi];
    if (!isBgaLikeFootprint(fp, 16)) {
      continue;
    }
    fpCount++;
    const cLocal = footprintCentroidLocal(fp);
    const pitch = estimatePitch(fp);
    const dogbone = Math.max(pitch * 0.35, grid * 4);

    // 外环：距质心最远的 ~30% 跳过
    const dists: number[] = [];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const p = fp.pads[pi];
      dists.push(Math.hypot(p.pos.x - cLocal.x, p.pos.y - cLocal.y));
    }
    const sorted = dists.slice().sort((a, b) => a - b);
    const outerThr = sorted[Math.floor(sorted.length * 0.7)] ?? 0;

    const sortedYs: number[] = [];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      let hit = false;
      for (let j = 0; j < sortedYs.length; j++) {
        if (Math.abs(sortedYs[j] - fp.pads[pi].pos.y) < 1) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        sortedYs.push(fp.pads[pi].pos.y);
      }
    }
    sortedYs.sort((a: number, b: number) => a - b);

    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      const netId = pad.netId ?? '';
      if (netId.length === 0) {
        continue;
      }
      if (dists[pi] >= outerThr - 0.5) {
        continue; // 外环
      }
      const world = padWorldPosition(fp, pad);
      let hasNearVia = false;
      for (let vi = 0; vi < doc.vias.length; vi++) {
        const v = doc.vias[vi];
        if (v.netId === netId && Math.hypot(v.position.x - world.x, v.position.y - world.y) < dogbone * 1.2) {
          hasNearVia = true;
          break;
        }
      }
      if (hasNearVia) {
        continue;
      }

      // 细间距：盘中孔（via-in-pad）；否则行列交替狗骨
      const useVip = pitch <= 24;
      let viaPos: Point2D;
      if (useVip) {
        viaPos = {
          x: Math.round(world.x / grid) * grid,
          y: Math.round(world.y / grid) * grid
        };
      } else {
        let row = 0;
        let bestDy = Number.POSITIVE_INFINITY;
        for (let ri = 0; ri < sortedYs.length; ri++) {
          const d = Math.abs(sortedYs[ri] - pad.pos.y);
          if (d < bestDy) {
            bestDy = d;
            row = ri;
          }
        }
        const dx = pad.pos.x - cLocal.x;
        const dy = pad.pos.y - cLocal.y;
        let ux = 0;
        let uy = 0;
        if ((row % 2) === 0) {
          ux = dx >= 0 ? 1 : -1;
          uy = 0;
        } else {
          ux = 0;
          uy = dy >= 0 ? 1 : -1;
        }
        viaPos = {
          x: Math.round((world.x + ux * dogbone) / grid) * grid,
          y: Math.round((world.y + uy * dogbone) / grid) * grid
        };
      }

      let drill = doc.metadata.designRules.minViaDrill;
      let diameter = drill + 8;
      for (const n of doc.nets) {
        if (n.id === netId) {
          const nc = findNetClass(doc, n.classId);
          drill = nc.viaDrill;
          diameter = nc.viaDiameter;
          break;
        }
      }
      const layers = copper.slice();
      if (!viaClearAt(doc, viaPos, netId, diameter, layers, doc.tracks, doc.vias)) {
        // 尝试四向微调
        const nudges: number[][] = [
          [grid * 2, 0], [-grid * 2, 0], [0, grid * 2], [0, -grid * 2],
          [grid * 4, 0], [-grid * 4, 0], [0, grid * 4], [0, -grid * 4]
        ];
        let ok = false;
        for (let ni = 0; ni < nudges.length; ni++) {
          const cand: Point2D = { x: viaPos.x + nudges[ni][0], y: viaPos.y + nudges[ni][1] };
          if (viaClearAt(doc, cand, netId, diameter, layers, doc.tracks, doc.vias)) {
            viaPos = cand;
            ok = true;
            break;
          }
        }
        if (!ok) {
          continue;
        }
      }

      const via: PcbVia = {
        id: IdUtil.generate('via'),
        position: viaPos,
        drill,
        diameter,
        netId,
        netName: pad.netName ?? '',
        layers,
        kind: PcbViaKind.THROUGH
      };
      doc.vias.push(via);
      viasAdded++;

      // SMD stub：VIP 无偏移则跳过 stub；狗骨才出短 stub
      if (pad.type === PcbPadType.SMD && !useVip) {
        if (Math.hypot(viaPos.x - world.x, viaPos.y - world.y) >= 0.5) {
          // 正交 stub
          const mid: Point2D = Math.abs(viaPos.x - world.x) >= Math.abs(viaPos.y - world.y)
            ? { x: viaPos.x, y: world.y }
            : { x: world.x, y: viaPos.y };
          const w = Math.max(doc.metadata.designRules.defaultTrackWidth, pad.size.x * 0.4);
          if (Math.hypot(mid.x - world.x, mid.y - world.y) >= 0.5) {
            doc.tracks.push({
              id: IdUtil.generate('trk'),
              layer: top,
              start: { x: world.x, y: world.y },
              end: { x: mid.x, y: mid.y },
              width: w,
              netId,
              netName: pad.netName ?? ''
            });
            stubsAdded++;
          }
          if (Math.hypot(viaPos.x - mid.x, viaPos.y - mid.y) >= 0.5) {
            doc.tracks.push({
              id: IdUtil.generate('trk'),
              layer: top,
              start: { x: mid.x, y: mid.y },
              end: { x: viaPos.x, y: viaPos.y },
              width: w,
              netId,
              netName: pad.netName ?? ''
            });
            stubsAdded++;
          }
        }
      }
    }
  }

  if (viasAdded > 0 || fpCount > 0) {
    tracePcb('BGA_FANOUT',
      `footprints=${fpCount} vias=${viasAdded} stubs=${stubsAdded}`);
  }
  return { viasAdded, stubsAdded, footprints: fpCount };
}
