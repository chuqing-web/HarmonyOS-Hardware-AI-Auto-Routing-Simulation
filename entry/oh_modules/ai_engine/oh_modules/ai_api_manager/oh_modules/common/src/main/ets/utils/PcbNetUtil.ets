/**
 * PCB 网络表重建、飞线、正交 L 路径、网络高亮辅助
 */
import {
  PcbDocument, PcbNet, PcbNetClass, PcbRatsnestEdge, PcbPad, PcbTrack,
  PcbFootprintInst, PcbPadType
} from '../types/PcbTypes';
import { Point2D } from '../types/CommonTypes';
import { padWorldPosition, pointInPolygon } from './PcbZoneUtil';
import { WireConflictGeometry } from './WireConflictGeometry';

export function guessNetClassId(netName: string, classes: PcbNetClass[]): string {
  const upper = (netName ?? '').toUpperCase();
  let powerId = 'nc_power';
  let signalId = 'nc_signal';
  let defaultId = 'nc_default';
  for (const c of classes) {
    if (c.name === 'Power') powerId = c.id;
    if (c.name === 'Signal') signalId = c.id;
    if (c.name === 'Default') defaultId = c.id;
  }
  if (upper === 'GND' || upper === 'VSS' || upper === 'AGND' ||
    upper === 'VOUT' || upper === 'REG_IN' || upper === 'VIN_SRC' ||
    upper.indexOf('VCC') >= 0 || upper.indexOf('VDD') >= 0 ||
    upper.indexOf('3V3') >= 0 || upper.indexOf('5V') >= 0 ||
    upper.indexOf('VIN') >= 0 || upper.indexOf('VBAT') >= 0 ||
    upper.indexOf('VOUT') >= 0) {
    return powerId;
  }
  if (upper.length > 0) {
    return signalId;
  }
  return defaultId;
}

export function findNetClass(doc: PcbDocument, classId?: string): PcbNetClass {
  if (classId) {
    for (const c of doc.netClasses) {
      if (c.id === classId) return c;
    }
  }
  for (const c of doc.netClasses) {
    if (c.name === 'Default') return c;
  }
  return doc.netClasses[0];
}

/** 从焊盘/走线/过孔重建 nets[] */
export function rebuildPcbNets(doc: PcbDocument): void {
  const map: Map<string, PcbNet> = new Map();
  const add = (netId?: string, netName?: string): void => {
    if (!netId || netId.length === 0) return;
    if (map.has(netId)) return;
    const name = netName && netName.length > 0 ? netName : netId;
    map.set(netId, {
      id: netId,
      name,
      classId: guessNetClassId(name, doc.netClasses)
    });
  };
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      add(pad.netId, pad.netName);
    }
  }
  for (const trk of doc.tracks) {
    add(trk.netId, trk.netName);
  }
  for (const via of doc.vias) {
    add(via.netId, via.netName);
  }
  for (const z of doc.zones) {
    add(z.netId, z.netName);
  }
  const nets: PcbNet[] = [];
  map.forEach((v: PcbNet) => {
    nets.push(v);
  });
  nets.sort((a: PcbNet, b: PcbNet) => a.name.localeCompare(b.name));
  doc.nets = nets;
}

interface PadNode {
  key: string;
  netId: string;
  netName: string;
  pos: Point2D;
}

interface CopperUnionFind {
  parent: Map<string, string>;
  keyOf: (p: Point2D) => string;
  find: (k: string) => string;
}

/**
 * 同网铜连通并查集：每个 net 只建一次。
 * 旧实现每次 padsCopperConnected 全量重建 + O(keys²) 近邻，
 * VCC 多焊盘时 buildRatsnest 会在主线程烧数秒（THREAD_BLOCK）。
 */
function buildCopperUnion(doc: PcbDocument, netId: string): CopperUnionFind {
  const tol = 15;
  const keyOf = (p: Point2D): string =>
    `${Math.round(p.x / tol)}_${Math.round(p.y / tol)}`;
  const parent: Map<string, string> = new Map();
  const find = (k: string): string => {
    let p = parent.get(k) ?? k;
    if (!parent.has(k)) {
      parent.set(k, k);
    }
    while (p !== (parent.get(p) ?? p)) {
      const pp = parent.get(p) ?? p;
      parent.set(p, parent.get(pp) ?? pp);
      p = parent.get(p) ?? p;
    }
    return p;
  };
  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) {
      parent.set(rx, ry);
    }
  };
  const touch = (p: Point2D): void => {
    const k = keyOf(p);
    if (!parent.has(k)) {
      parent.set(k, k);
    }
  };

  for (const trk of doc.tracks) {
    if (trk.netId !== netId) {
      continue;
    }
    touch(trk.start);
    touch(trk.end);
    union(keyOf(trk.start), keyOf(trk.end));
  }
  for (const via of doc.vias) {
    if (via.netId !== netId) {
      continue;
    }
    touch(via.position);
  }
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (pad.netId !== netId) {
        continue;
      }
      touch(padWorldPosition(fp, pad));
    }
  }

  // 同网同层几何连通：交叉 / T 接 / 中段压焊盘 / 过孔旁路（不仅依赖端点）
  const sameNetTracks: PcbTrack[] = [];
  for (let ti = 0; ti < doc.tracks.length; ti++) {
    if (doc.tracks[ti].netId === netId) {
      sameNetTracks.push(doc.tracks[ti]);
    }
  }
  const ptSegDist = (p: Point2D, a: Point2D, b: Point2D): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const padOnLayer = (pad: PcbPad, layer: string): boolean => {
    if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
      return true;
    }
    if (!pad.layers || pad.layers.length === 0) {
      return true;
    }
    for (let i = 0; i < pad.layers.length; i++) {
      if (`${pad.layers[i]}` === layer) {
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < sameNetTracks.length; i++) {
    const a = sameNetTracks[i];
    for (let j = i + 1; j < sameNetTracks.length; j++) {
      const b = sameNetTracks[j];
      if (a.layer !== b.layer) {
        continue;
      }
      const kind = WireConflictGeometry.segmentConflict(a.start, a.end, b.start, b.end);
      if (kind === 'orthogonal_cross' || kind === 'collinear_overlap') {
        const cp = WireConflictGeometry.orthogonalCrossPoint(a.start, a.end, b.start, b.end);
        if (cp !== null) {
          touch(cp);
          union(keyOf(cp), keyOf(a.start));
          union(keyOf(cp), keyOf(b.start));
        } else {
          union(keyOf(a.start), keyOf(b.start));
          union(keyOf(a.end), keyOf(b.end));
        }
      }
      const hitTol = Math.max(a.width, b.width) / 2 + 2;
      const joinEp = (ep: Point2D, segA: Point2D, segB: Point2D): void => {
        if (ptSegDist(ep, segA, segB) <= hitTol) {
          touch(ep);
          union(keyOf(ep), keyOf(segA));
          union(keyOf(ep), keyOf(segB));
        }
      };
      joinEp(a.start, b.start, b.end);
      joinEp(a.end, b.start, b.end);
      joinEp(b.start, a.start, a.end);
      joinEp(b.end, a.start, a.end);
    }
  }
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (pad.netId !== netId) {
        continue;
      }
      const wp = padWorldPosition(fp, pad);
      const padR = Math.max(pad.size.x, pad.size.y) / 2;
      for (let ti = 0; ti < sameNetTracks.length; ti++) {
        const trk = sameNetTracks[ti];
        if (!padOnLayer(pad, `${trk.layer}`)) {
          continue;
        }
        const hitR = padR + trk.width / 2;
        if (ptSegDist(wp, trk.start, trk.end) <= hitR) {
          touch(wp);
          union(keyOf(wp), keyOf(trk.start));
          union(keyOf(wp), keyOf(trk.end));
        }
      }
    }
  }
  for (const via of doc.vias) {
    if (via.netId !== netId) {
      continue;
    }
    const viaR = (via.diameter > 0 ? via.diameter : 20) / 2;
    for (let ti = 0; ti < sameNetTracks.length; ti++) {
      const trk = sameNetTracks[ti];
      const hitR = viaR + trk.width / 2;
      if (ptSegDist(via.position, trk.start, trk.end) <= hitR) {
        touch(via.position);
        union(keyOf(via.position), keyOf(trk.start));
      }
    }
  }

  for (let zi = 0; zi < doc.zones.length; zi++) {
    const z = doc.zones[zi];
    if (z.netId !== netId || z.outline.length < 3) {
      continue;
    }
    const hub = `__zone_${zi}`;
    if (!parent.has(hub)) {
      parent.set(hub, hub);
    }
    for (let i = 0; i < z.outline.length; i++) {
      const p = z.outline[i];
      touch(p);
      union(keyOf(p), hub);
      if (i > 0) {
        union(keyOf(z.outline[i - 1]), keyOf(p));
      }
    }
    union(keyOf(z.outline[z.outline.length - 1]), keyOf(z.outline[0]));
    for (const fp of doc.footprints) {
      for (const pad of fp.pads) {
        if (pad.netId !== netId) {
          continue;
        }
        if (!padTouchesZoneLayer(pad.layers, pad.type, z.layer)) {
          continue;
        }
        const wp = padWorldPosition(fp, pad);
        if (!pointInPolygon(wp, z.outline)) {
          continue;
        }
        touch(wp);
        union(keyOf(wp), hub);
      }
    }
    for (const via of doc.vias) {
      if (via.netId !== netId) {
        continue;
      }
      if (!pointInPolygon(via.position, z.outline)) {
        continue;
      }
      touch(via.position);
      union(keyOf(via.position), hub);
    }
  }
  // 网格近邻：按格桶聚合，避免 O(keys²)
  const buckets: Map<string, string[]> = new Map();
  parent.forEach((_v: string, k: string) => {
    if (k.startsWith('__zone_')) {
      return;
    }
    const parts = k.split('_');
    if (parts.length < 2) {
      return;
    }
    const gx = Number(parts[0]);
    const gy = Number(parts[1]);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
      return;
    }
    const bk = `${gx}_${gy}`;
    let list = buckets.get(bk);
    if (list === undefined) {
      list = [];
      buckets.set(bk, list);
    }
    list.push(k);
  });
  buckets.forEach((list: string[], bk: string) => {
    const parts = bk.split('_');
    const gx = Number(parts[0]);
    const gy = Number(parts[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nb = buckets.get(`${gx + dx}_${gy + dy}`);
        if (nb === undefined) {
          continue;
        }
        for (let i = 0; i < list.length; i++) {
          for (let j = 0; j < nb.length; j++) {
            if (dx === 0 && dy === 0 && j <= i) {
              continue;
            }
            union(list[i], nb[j]);
          }
        }
      }
    }
  });
  const out: CopperUnionFind = { parent, keyOf, find };
  return out;
}

function padsConnectedInUnion(uf: CopperUnionFind, a: Point2D, b: Point2D): boolean {
  const ka = uf.keyOf(a);
  const kb = uf.keyOf(b);
  if (!uf.parent.has(ka) || !uf.parent.has(kb)) {
    return false;
  }
  return uf.find(ka) === uf.find(kb);
}

/** 未连接焊盘对飞线（同网最小生成树边，过滤已有铜连通） */
export function buildRatsnest(doc: PcbDocument): PcbRatsnestEdge[] {
  const nodesByNet: Map<string, PadNode[]> = new Map();
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.netId || pad.netId.length === 0) {
        continue;
      }
      const pos = padWorldPosition(fp, pad);
      const list = nodesByNet.get(pad.netId) ?? [];
      list.push({
        key: `${fp.id}:${pad.number}`,
        netId: pad.netId,
        netName: pad.netName ?? pad.netId,
        pos
      });
      nodesByNet.set(pad.netId, list);
    }
  }

  const edges: PcbRatsnestEdge[] = [];
  nodesByNet.forEach((nodes: PadNode[], netId: string) => {
    if (nodes.length < 2) {
      return;
    }
    const uf = buildCopperUnion(doc, netId);
    let fully = true;
    for (let i = 1; i < nodes.length; i++) {
      if (!padsConnectedInUnion(uf, nodes[0].pos, nodes[i].pos)) {
        fully = false;
        break;
      }
    }
    if (fully) {
      return;
    }
    const used: boolean[] = [];
    for (let i = 0; i < nodes.length; i++) {
      used.push(false);
    }
    used[0] = true;
    let usedCount = 1;
    while (usedCount < nodes.length) {
      let bestI = -1;
      let bestJ = -1;
      let bestD = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (!used[i]) {
          continue;
        }
        for (let j = 0; j < nodes.length; j++) {
          if (used[j]) {
            continue;
          }
          const dx = nodes[i].pos.x - nodes[j].pos.x;
          const dy = nodes[i].pos.y - nodes[j].pos.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            bestI = i;
            bestJ = j;
          }
        }
      }
      if (bestJ < 0) {
        break;
      }
      used[bestJ] = true;
      usedCount++;
      if (!padsConnectedInUnion(uf, nodes[bestI].pos, nodes[bestJ].pos)) {
        edges.push({
          netId,
          netName: nodes[bestI].netName,
          a: { x: nodes[bestI].pos.x, y: nodes[bestI].pos.y },
          b: { x: nodes[bestJ].pos.x, y: nodes[bestJ].pos.y }
        });
      }
    }
  });
  return edges;
}

/** 简化连通：同网铜皮图元端点网格并查集（含 Zone 覆铜） */
export function padsCopperConnected(doc: PcbDocument, netId: string, a: Point2D, b: Point2D): boolean {
  if (!netId || netId.length === 0) {
    return false;
  }
  return padsConnectedInUnion(buildCopperUnion(doc, netId), a, b);
}

/**
 * 用一次铜并查集合并已连通的焊盘索引（避免 O(焊盘²) 次重建并查集）。
 */
export function reunitePadsByCopper(
  doc: PcbDocument,
  netId: string,
  pads: Point2D[],
  alreadyUnited: (i: number, j: number) => boolean,
  unite: (i: number, j: number) => void
): void {
  if (!netId || netId.length === 0 || pads.length < 2) {
    return;
  }
  const uf = buildCopperUnion(doc, netId);
  for (let i = 0; i < pads.length; i++) {
    for (let j = i + 1; j < pads.length; j++) {
      if (alreadyUnited(i, j)) {
        continue;
      }
      if (padsConnectedInUnion(uf, pads[i], pads[j])) {
        unite(i, j);
      }
    }
  }
}

/** 焊盘是否能接到指定铜层（通孔焊盘默认双面） */
function padTouchesZoneLayer(layers: string[] | undefined | null, padType: string,
  zoneLayer: string): boolean {
  if (padType === 'th' || padType === 'npth') return true;
  if (!layers || layers.length === 0) return true;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i] === zoneLayer) return true;
  }
  return false;
}

/** 正交 L 折线（90°） */
export function routeLPoints(a: Point2D, b: Point2D): Point2D[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    return [a, b];
  }
  const midH: Point2D = { x: b.x, y: a.y };
  const midV: Point2D = { x: a.x, y: b.y };
  const lenH = Math.abs(dx) + Math.abs(b.y - a.y);
  const lenV = Math.abs(dy) + Math.abs(b.x - a.x);
  if (lenH <= lenV) {
    return [a, midH, b];
  }
  return [a, midV, b];
}

/** 45° 折线（优先） */
export function routeOrtho45Points(a: Point2D, b: Point2D): Point2D[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    return [a, b];
  }
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (Math.abs(adx - ady) < 0.5) {
    return [a, b];
  }
  if (adx > ady) {
    const sx = dx > 0 ? 1 : -1;
    const mid: Point2D = { x: a.x + sx * (adx - ady), y: a.y };
    return [a, mid, b];
  }
  const sy = dy > 0 ? 1 : -1;
  const mid: Point2D = { x: a.x, y: a.y + sy * (ady - adx) };
  return [a, mid, b];
}

/**
 * 圆弧拐角：以 45° 折点为控制点的二次贝塞尔，离散为折线（可提交为多段 track）
 */
export function routeArcPoints(a: Point2D, b: Point2D, segments: number = 12): Point2D[] {
  const base = routeOrtho45Points(a, b);
  if (base.length < 3) {
    return base;
  }
  const ctrl = base[1];
  const n = Math.max(6, Math.min(24, segments));
  const pts: Point2D[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y
    });
  }
  return pts;
}

/** 按拐角模式生成布线路径 */
export function routeByCornerMode(a: Point2D, b: Point2D, mode: string): Point2D[] {
  if (mode === 'ortho90') {
    return routeLPoints(a, b);
  }
  if (mode === 'arc') {
    return routeArcPoints(a, b, 12);
  }
  return routeOrtho45Points(a, b);
}

export function sumTrackLengthForNet(doc: PcbDocument, netId: string): number {
  let len = 0;
  for (const trk of doc.tracks) {
    if (trk.netId !== netId) continue;
    const dx = trk.end.x - trk.start.x;
    const dy = trk.end.y - trk.start.y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

export function collectPadWorld(fp: PcbFootprintInst, pad: PcbPad): Point2D {
  return padWorldPosition(fp, pad);
}
