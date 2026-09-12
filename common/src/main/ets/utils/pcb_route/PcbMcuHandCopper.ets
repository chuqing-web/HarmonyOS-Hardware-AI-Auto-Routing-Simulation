/**
 * MCU 专用手布阶段（对齐 lab_mcu_stm32）：
 * 电源 H/V 干线 + 列馈 → XTAL F 短桩分跳 → NRST 外侧 U 路径 → LED B 绕行。
 * 检测到多 MCU+晶振簇时由 autoRoutePcb 在 detail 前调用；剩余飞线交给 AUTO。
 */
import {
  PcbDocument, PcbFootprintInst, PcbLayerId, PcbNet, PcbPad, PcbTrack, PcbVia,
  PcbViaKind, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { PcbLayerRole } from '../../types/PcbAiRouteTypes';
import { IdUtil } from '../IdUtil';
import { padWorldPosition } from '../PcbZoneUtil';
import { detectMcuColumnClusters } from './PcbMcuColumnPlacer';
import { tracePcb } from '../PcbTraceLog';

export interface McuHandCopperResult {
  applied: boolean;
  tracksAdded: number;
  viasAdded: number;
  clusters: number;
  reason: string;
}

interface LayerMap {
  f: PcbLayerId;
  b: PcbLayerId;
  vccH: PcbLayerId;
  gndH: PcbLayerId;
  vccV: PcbLayerId;
  gndV: PcbLayerId;
  xtal1Hop: PcbLayerId;
  xtal2Hop: PcbLayerId;
}

interface ClusterPack {
  idx: number; // U 序号 1-based
  z: number; // 网名 S{z}_* 0-based
  mcu: PcbFootprintInst;
  xtal: PcbFootprintInst | null;
  cx1: PcbFootprintInst | null;
  cx2: PcbFootprintInst | null;
  rst: PcbFootprintInst | null;
  decap: PcbFootprintInst | null;
  ledr: PcbFootprintInst | null;
  led: PcbFootprintInst | null;
}

function refIndex(ref: string): number {
  let n = 0;
  let found = false;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      n = n * 10 + (c - 48);
      found = true;
    } else if (found) {
      break;
    }
  }
  return found ? n : -1;
}

function isMcuRef(ref: string): boolean {
  if (ref.length < 2 || ref.charAt(0) !== 'U') {
    return false;
  }
  for (let i = 1; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
}

function byRef(doc: PcbDocument): Map<string, PcbFootprintInst> {
  const map: Map<string, PcbFootprintInst> = new Map();
  for (let i = 0; i < doc.footprints.length; i++) {
    const fp = doc.footprints[i];
    const r = (fp.refDes ?? '').toUpperCase();
    if (r.length > 0) {
      map.set(r, fp);
    }
  }
  return map;
}

function findRef(map: Map<string, PcbFootprintInst>, ref: string): PcbFootprintInst | null {
  const hit = map.get(ref.toUpperCase());
  if (hit !== undefined) {
    return hit;
  }
  return null;
}

function collectPacks(doc: PcbDocument): ClusterPack[] {
  const map = byRef(doc);
  const out: ClusterPack[] = [];
  for (let i = 0; i < doc.footprints.length; i++) {
    const fp = doc.footprints[i];
    const ref = (fp.refDes ?? '').toUpperCase();
    if (!isMcuRef(ref)) {
      continue;
    }
    const idx = refIndex(ref);
    if (idx < 0) {
      continue;
    }
    const z = idx - 1;
    let cx1 = findRef(map, `CX${z}1`);
    let cx2 = findRef(map, `CX${z}2`);
    if (cx1 === null) {
      cx1 = findRef(map, `CX${idx}1`);
    }
    if (cx2 === null) {
      cx2 = findRef(map, `CX${idx}2`);
    }
    out.push({
      idx: idx,
      z: z,
      mcu: fp,
      xtal: findRef(map, `Y${idx}`),
      cx1: cx1,
      cx2: cx2,
      rst: findRef(map, `R${idx}`),
      decap: findRef(map, `CD${idx}`),
      ledr: findRef(map, `RL${idx}`),
      led: findRef(map, `D${idx}`)
    });
  }
  out.sort((a: ClusterPack, b: ClusterPack) => a.mcu.position.x - b.mcu.position.x);
  return out;
}

function netByName(doc: PcbDocument, name: string): PcbNet | null {
  const u = name.toUpperCase();
  for (let i = 0; i < doc.nets.length; i++) {
    if ((doc.nets[i].name || '').toUpperCase() === u) {
      return doc.nets[i];
    }
  }
  return null;
}

function findGnd(doc: PcbDocument): PcbNet | null {
  for (let i = 0; i < doc.nets.length; i++) {
    const n = (doc.nets[i].name || '').toUpperCase();
    if (n === 'GND' || n === 'VSS' || n === 'AGND' || n.indexOf('GND') === 0) {
      return doc.nets[i];
    }
  }
  return null;
}

function findVcc(doc: PcbDocument): PcbNet | null {
  for (let i = 0; i < doc.nets.length; i++) {
    const n = (doc.nets[i].name || '').toUpperCase();
    if (n === 'VCC' || n === 'VDD' || n === '3V3' || n === '3.3V' ||
      n.indexOf('VCC') === 0 || n.indexOf('VDD') === 0) {
      return doc.nets[i];
    }
  }
  return null;
}

/** S{z}_XTAL1 优先；兼容 S{idx}_* */
function clusterNet(doc: PcbDocument, z: number, idx: number, suffix: string): PcbNet | null {
  const a = netByName(doc, `S${z}_${suffix}`);
  if (a !== null) {
    return a;
  }
  return netByName(doc, `S${idx}_${suffix}`);
}

function padWorld(fp: PcbFootprintInst, pad: PcbPad): Point2D {
  return padWorldPosition(fp, pad);
}

function firstPadOnNet(fp: PcbFootprintInst | null, netId: string): Point2D | null {
  if (fp === null || netId.length === 0) {
    return null;
  }
  for (let i = 0; i < fp.pads.length; i++) {
    if ((fp.pads[i].netId ?? '') === netId) {
      return padWorld(fp, fp.pads[i]);
    }
  }
  return null;
}

function padsOnNet(fp: PcbFootprintInst | null, netId: string): Point2D[] {
  const out: Point2D[] = [];
  if (fp === null) {
    return out;
  }
  for (let i = 0; i < fp.pads.length; i++) {
    if ((fp.pads[i].netId ?? '') === netId) {
      out.push(padWorld(fp, fp.pads[i]));
    }
  }
  return out;
}

function fpHalfW(fp: PcbFootprintInst): number {
  let m = 80;
  for (let i = 0; i < fp.pads.length; i++) {
    const p = fp.pads[i];
    m = Math.max(m, Math.abs(p.pos.x) + p.size.x * 0.5);
  }
  return m;
}

function boardXSpan(doc: PcbDocument): number[] {
  const pts = doc.boardOutline?.points ?? [];
  if (pts.length < 2) {
    return [0, 5000];
  }
  let minX = pts[0].x;
  let maxX = pts[0].x;
  for (let i = 1; i < pts.length; i++) {
    minX = Math.min(minX, pts[i].x);
    maxX = Math.max(maxX, pts[i].x);
  }
  return [minX, maxX];
}

function resolveLayers(copper: PcbLayerId[]): LayerMap | null {
  if (copper.length < 2) {
    return null;
  }
  const f = copper[0];
  const b = copper[copper.length - 1];
  if (copper.length >= 6) {
    return {
      f: f,
      b: b,
      vccH: copper[1],
      gndH: copper[2],
      vccV: copper[3],
      gndV: copper[4],
      xtal1Hop: b,
      xtal2Hop: copper[1]
    };
  }
  // Cu=4/5：In1=VCC干线+XTAL2；In2=GND干线/竖馈；B=XTAL1+LED
  if (copper.length >= 4) {
    return {
      f: f,
      b: b,
      vccH: copper[1],
      gndH: copper[2],
      vccV: copper[1],
      gndV: copper[2],
      xtal1Hop: b,
      xtal2Hop: copper[1]
    };
  }
  // Cu=2/3：尽量用 B 做 hop，电源走 B
  return {
    f: f,
    b: b,
    vccH: b,
    gndH: b,
    vccV: b,
    gndV: b,
    xtal1Hop: b,
    xtal2Hop: f
  };
}

/**
 * MCU 手布层角色（供 Strategy / LocalPolicy）。
 * Cu≥6：F stub；In1 vcc_bus；In2 gnd_bus；In3/In4 power_v；B power_h。
 * Cu=4：F stub；In1 power_h；In2 power_v；B signal_h（满足 H/V 校验且不闲置内层）。
 */
export function buildMcuHandLayerRoles(copper: PcbLayerId[]): Record<string, PcbLayerRole> {
  const roles: Record<string, PcbLayerRole> = {};
  const n = copper.length;
  if (n === 0) {
    return roles;
  }
  if (n >= 6) {
    roles[copper[0] as string] = 'stub';
    roles[copper[1] as string] = 'vcc_bus';
    roles[copper[2] as string] = 'gnd_bus';
    roles[copper[3] as string] = 'power_v';
    roles[copper[4] as string] = 'power_v';
    roles[copper[n - 1] as string] = 'power_h';
    for (let i = 5; i < n - 1; i++) {
      roles[copper[i] as string] = (i % 2 === 1) ? 'signal_h' : 'signal_v';
    }
    return roles;
  }
  if (n >= 4) {
    roles[copper[0] as string] = 'stub';
    roles[copper[1] as string] = 'power_h';
    roles[copper[2] as string] = 'power_v';
    roles[copper[n - 1] as string] = 'signal_h';
    for (let i = 3; i < n - 1; i++) {
      roles[copper[i] as string] = (i % 2 === 1) ? 'signal_h' : 'signal_v';
    }
    return roles;
  }
  roles[copper[0] as string] = 'stub';
  if (n >= 2) {
    roles[copper[n - 1] as string] = 'power_h';
  }
  if (n === 3) {
    roles[copper[1] as string] = 'power_v';
  }
  return roles;
}

function addTrack(doc: PcbDocument, net: PcbNet, a: Point2D, b: Point2D,
  w: number, layer: PcbLayerId): void {
  if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) {
    return;
  }
  const trk: PcbTrack = {
    id: IdUtil.generate('trk'),
    layer: layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
    width: w,
    netId: net.id,
    netName: net.name
  };
  doc.tracks.push(trk);
}

function addVia(doc: PcbDocument, net: PcbNet, pt: Point2D, copper: PcbLayerId[]): void {
  for (let i = 0; i < doc.vias.length; i++) {
    const v = doc.vias[i];
    if (v.netId === net.id &&
      Math.abs(v.position.x - pt.x) < 0.5 &&
      Math.abs(v.position.y - pt.y) < 0.5) {
      return;
    }
  }
  const via: PcbVia = {
    id: IdUtil.generate('via'),
    position: { x: pt.x, y: pt.y },
    drill: 12,
    diameter: 24,
    netId: net.id,
    netName: net.name,
    layers: copper.slice(),
    kind: PcbViaKind.THROUGH
  };
  doc.vias.push(via);
}

function esc(doc: PcbDocument, net: PcbNet, pad: Point2D, dx: number, dy: number,
  w: number, layers: LayerMap, copper: PcbLayerId[]): Point2D {
  const e: Point2D = { x: pad.x + dx, y: pad.y + dy };
  addTrack(doc, net, pad, e, w, layers.f);
  addVia(doc, net, e, copper);
  return e;
}

function clearCopperForNetIds(doc: PcbDocument, netIds: Set<string>): void {
  if (netIds.size === 0) {
    return;
  }
  const keepT: PcbTrack[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    if (!netIds.has(doc.tracks[i].netId)) {
      keepT.push(doc.tracks[i]);
    }
  }
  doc.tracks = keepT;
  const keepV: PcbVia[] = [];
  for (let i = 0; i < doc.vias.length; i++) {
    if (!netIds.has(doc.vias[i].netId)) {
      keepV.push(doc.vias[i]);
    }
  }
  doc.vias = keepV;
}

function hasWideTrunk(doc: PcbDocument, netId: string, layer: PcbLayerId): boolean {
  for (let i = 0; i < doc.tracks.length; i++) {
    const t = doc.tracks[i];
    if (t.netId === netId && t.layer === layer && t.width >= 18) {
      const span = Math.abs(t.end.x - t.start.x) + Math.abs(t.end.y - t.start.y);
      if (span > 400) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 若板含 ≥1 个 MCU+晶振簇，按模板铺手布铜皮。
 * Cu<4 仍尝试简化干线；无电源网则只做信号短连。
 */
export function applyMcuHandCopper(doc: PcbDocument): McuHandCopperResult {
  const clusters = detectMcuColumnClusters(doc);
  if (clusters <= 0) {
    return { applied: false, tracksAdded: 0, viasAdded: 0, clusters: 0, reason: 'no_mcu_xtal' };
  }
  const packs = collectPacks(doc);
  const copper = copperLayersFromStack(doc.layerStack);
  const layers = resolveLayers(copper);
  if (layers === null) {
    return { applied: false, tracksAdded: 0, viasAdded: 0, clusters: clusters, reason: 'no_copper' };
  }

  // 清簇信号旧铜，避免重跑叠线；电源干线有宽干线则跳过重铺
  const clearIds: Set<string> = new Set();
  for (let i = 0; i < packs.length; i++) {
    const c = packs[i];
    const names = [
      `S${c.z}_XTAL1`, `S${c.z}_XTAL2`, `S${c.z}_NRST`,
      `S${c.idx}_XTAL1`, `S${c.idx}_XTAL2`, `S${c.idx}_NRST`,
      `L${c.z}_R`, `L${c.z}_LED`, `L${c.idx}_R`, `L${c.idx}_LED`
    ];
    for (let ni = 0; ni < names.length; ni++) {
      const n = netByName(doc, names[ni]);
      if (n !== null) {
        clearIds.add(n.id);
      }
    }
  }
  clearCopperForNetIds(doc, clearIds);

  const tracks0 = doc.tracks.length;
  const vias0 = doc.vias.length;
  const gnd = findGnd(doc);
  const vcc = findVcc(doc);
  const span = boardXSpan(doc);
  const x0 = span[0] + 60;
  let x1 = span[1] - 60;

  // 总线 Y：相对 MCU 行上下偏移（模板 uy±1300）
  let uySum = 0;
  for (let i = 0; i < packs.length; i++) {
    uySum += packs[i].mcu.position.y;
  }
  const uy = packs.length > 0 ? uySum / packs.length : 1600;
  const gndBusY = uy + 1300;
  const vccBusY = uy - 1300;

  const map = byRef(doc);
  const j1 = findRef(map, 'J1');
  if (j1 !== null) {
    x1 = Math.max(x1, j1.position.x + 120);
  }

  const needVccTrunk = vcc !== null && !hasWideTrunk(doc, vcc.id, layers.vccH);
  const needGndTrunk = gnd !== null && !hasWideTrunk(doc, gnd.id, layers.gndH);

  // —— 全局 H 干线 ——
  if (vcc !== null && needVccTrunk) {
    addTrack(doc, vcc, { x: x0, y: vccBusY }, { x: x1, y: vccBusY }, 22, layers.vccH);
    addTrack(doc, vcc, { x: x0, y: vccBusY + 50 }, { x: x1, y: vccBusY + 50 }, 16, layers.b);
  }
  if (gnd !== null && needGndTrunk) {
    addTrack(doc, gnd, { x: x0, y: gndBusY }, { x: x1, y: gndBusY }, 22, layers.gndH);
    addTrack(doc, gnd, { x: x0, y: gndBusY - 50 }, { x: x1, y: gndBusY - 50 }, 16, layers.b);
  }

  for (let i = 0; i < packs.length; i++) {
    const c = packs[i];
    const ux = c.mcu.position.x;
    const half = fpHalfW(c.mcu);
    const leftX = ux - half - 40;
    const rightX = ux + half + 40;
    const vccFeedX = rightX + 200;
    const gndFeedL = leftX - 200;
    const gndFeedR = rightX + 40;
    const vccFeedL = leftX - 400;

    const xtal1 = clusterNet(doc, c.z, c.idx, 'XTAL1');
    const xtal2 = clusterNet(doc, c.z, c.idx, 'XTAL2');
    const nrst = clusterNet(doc, c.z, c.idx, 'NRST');
    const ledRNet = netByName(doc, `L${c.z}_R`) ?? netByName(doc, `L${c.idx}_R`);
    const ledANet = netByName(doc, `L${c.z}_LED`) ?? netByName(doc, `L${c.idx}_LED`);

    const uX1 = xtal1 !== null ? firstPadOnNet(c.mcu, xtal1.id) : null;
    const uX2 = xtal2 !== null ? firstPadOnNet(c.mcu, xtal2.id) : null;
    const yPads1 = xtal1 !== null ? padsOnNet(c.xtal, xtal1.id) : [];
    const yPads2 = xtal2 !== null ? padsOnNet(c.xtal, xtal2.id) : [];
    const yA = yPads1.length > 0 ? yPads1[0] : null;
    const yB = yPads2.length > 0 ? yPads2[0] : (yPads1.length > 1 ? yPads1[1] : null);

    // XTAL1: F stub → hop(B) H → F to Y
    if (xtal1 !== null && uX1 !== null && yA !== null) {
      const e = esc(doc, xtal1, uX1, -50, 0, 12, layers, copper);
      addTrack(doc, xtal1, e, { x: yA.x, y: e.y }, 12, layers.xtal1Hop);
      addVia(doc, xtal1, { x: yA.x, y: e.y }, copper);
      addTrack(doc, xtal1, { x: yA.x, y: e.y }, yA, 12, layers.f);
    }
    // XTAL2: F stub → hop(In1) H → F to Y
    if (xtal2 !== null && uX2 !== null && yB !== null) {
      const e = esc(doc, xtal2, uX2, -55, 0, 12, layers, copper);
      addTrack(doc, xtal2, e, { x: yB.x, y: e.y }, 12, layers.xtal2Hop);
      addVia(doc, xtal2, { x: yB.x, y: e.y }, copper);
      addTrack(doc, xtal2, { x: yB.x, y: e.y }, yB, 12, layers.f);
    }
    // CX 负载：F L 短连到晶振脚
    if (xtal1 !== null && yA !== null && c.cx1 !== null) {
      const cxA = firstPadOnNet(c.cx1, xtal1.id);
      if (cxA !== null) {
        addTrack(doc, xtal1, yA, { x: yA.x, y: cxA.y }, 12, layers.f);
        addTrack(doc, xtal1, { x: yA.x, y: cxA.y }, cxA, 12, layers.f);
      }
    }
    if (xtal2 !== null && yB !== null && c.cx2 !== null) {
      const cxA = firstPadOnNet(c.cx2, xtal2.id);
      if (cxA !== null) {
        addTrack(doc, xtal2, yB, { x: yB.x, y: cxA.y }, 12, layers.f);
        addTrack(doc, xtal2, { x: yB.x, y: cxA.y }, cxA, 12, layers.f);
      }
    }

    // CX GND → In4 竖馈
    if (gnd !== null) {
      const cxGnds: Point2D[] = [];
      if (c.cx1 !== null) {
        const p = firstPadOnNet(c.cx1, gnd.id);
        if (p !== null) {
          cxGnds.push(p);
        }
      }
      if (c.cx2 !== null) {
        const p = firstPadOnNet(c.cx2, gnd.id);
        if (p !== null) {
          cxGnds.push(p);
        }
      }
      for (let gi = 0; gi < cxGnds.length; gi++) {
        const e = esc(doc, gnd, cxGnds[gi], 0, 55, 12, layers, copper);
        addTrack(doc, gnd, e, { x: gndFeedL, y: e.y }, 14, layers.gndV);
        addTrack(doc, gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, layers.gndV);
        addVia(doc, gnd, { x: gndFeedL, y: gndBusY }, copper);
      }
    }

    // MCU GND / VCC 反方向逃逸
    if (gnd !== null) {
      const uGnd = firstPadOnNet(c.mcu, gnd.id);
      if (uGnd !== null) {
        const e = esc(doc, gnd, uGnd, -70, 0, 14, layers, copper);
        addTrack(doc, gnd, e, { x: gndFeedL, y: e.y }, 14, layers.gndV);
        addTrack(doc, gnd, { x: gndFeedL, y: e.y }, { x: gndFeedL, y: gndBusY }, 14, layers.gndV);
        addVia(doc, gnd, { x: gndFeedL, y: gndBusY }, copper);
      }
    }
    if (vcc !== null) {
      const uVcc = firstPadOnNet(c.mcu, vcc.id);
      if (uVcc !== null) {
        const e = esc(doc, vcc, uVcc, 70, 0, 14, layers, copper);
        addTrack(doc, vcc, e, { x: vccFeedX, y: e.y }, 14, layers.vccV);
        addTrack(doc, vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, layers.vccV);
        addVia(doc, vcc, { x: vccFeedX, y: vccBusY }, copper);
      }
    }

    // CD GND/VCC
    if (gnd !== null && c.decap !== null) {
      const cdb = firstPadOnNet(c.decap, gnd.id);
      if (cdb !== null) {
        const e = esc(doc, gnd, cdb, 60, 0, 12, layers, copper);
        addTrack(doc, gnd, e, { x: gndFeedR, y: e.y }, 14, layers.gndV);
        addTrack(doc, gnd, { x: gndFeedR, y: e.y }, { x: gndFeedR, y: gndBusY }, 14, layers.gndV);
        addVia(doc, gnd, { x: gndFeedR, y: gndBusY }, copper);
        addTrack(doc, gnd, { x: gndFeedR, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, layers.gndH);
      }
    }
    if (vcc !== null && c.decap !== null) {
      const cda = firstPadOnNet(c.decap, vcc.id);
      if (cda !== null) {
        const e = esc(doc, vcc, cda, 55, 0, 12, layers, copper);
        addTrack(doc, vcc, e, { x: vccFeedX, y: e.y }, 14, layers.vccV);
        addTrack(doc, vcc, { x: vccFeedX, y: e.y }, { x: vccFeedX, y: vccBusY }, 14, layers.vccV);
        addVia(doc, vcc, { x: vccFeedX, y: vccBusY }, copper);
      }
    }

    // LED cathode GND
    if (gnd !== null && c.led !== null) {
      const dK = firstPadOnNet(c.led, gnd.id);
      if (dK !== null) {
        const e = esc(doc, gnd, dK, -55, 0, 12, layers, copper);
        addTrack(doc, gnd, e, { x: e.x, y: gndBusY }, 14, layers.gndV);
        addVia(doc, gnd, { x: e.x, y: gndBusY }, copper);
        addTrack(doc, gnd, { x: e.x, y: gndBusY }, { x: gndFeedL, y: gndBusY }, 14, layers.gndH);
      }
    }

    // NRST：MCU 焊盘列外侧竖走
    if (nrst !== null && c.rst !== null) {
      const r1a = firstPadOnNet(c.rst, nrst.id);
      const uRst = firstPadOnNet(c.mcu, nrst.id);
      if (r1a !== null && uRst !== null) {
        const colX = Math.min(r1a.x, uRst.x) - 50;
        addTrack(doc, nrst, r1a, { x: colX, y: r1a.y }, 12, layers.f);
        addTrack(doc, nrst, { x: colX, y: r1a.y }, { x: colX, y: uRst.y }, 12, layers.f);
        addTrack(doc, nrst, { x: colX, y: uRst.y }, uRst, 12, layers.f);
      }
      if (vcc !== null) {
        const r1b = firstPadOnNet(c.rst, vcc.id);
        if (r1b !== null) {
          const e = esc(doc, vcc, r1b, -60, 0, 12, layers, copper);
          addTrack(doc, vcc, e, { x: vccFeedL, y: e.y }, 14, layers.vccV);
          addTrack(doc, vcc, { x: vccFeedL, y: e.y }, { x: vccFeedL, y: vccBusY }, 14, layers.vccV);
          addVia(doc, vcc, { x: vccFeedL, y: vccBusY }, copper);
          addTrack(doc, vcc, { x: vccFeedL, y: vccBusY }, { x: vccFeedX, y: vccBusY }, 14, layers.vccH);
        }
      }
    }

    // LED：L*_R 走 B 绕，L*_LED 在 B 短连 RL↔D
    const lr = ledRNet;
    const la = ledANet;
    if (lr !== null && c.ledr !== null) {
      const uPa = firstPadOnNet(c.mcu, lr.id);
      const rlA = firstPadOnNet(c.ledr, lr.id);
      if (uPa !== null && rlA !== null) {
        const e = esc(doc, lr, uPa, -60, 0, 12, layers, copper);
        const jx = rlA.x - 80;
        addTrack(doc, lr, e, { x: e.x, y: rlA.y + 90 }, 12, layers.b);
        addTrack(doc, lr, { x: e.x, y: rlA.y + 90 }, { x: jx, y: rlA.y + 90 }, 12, layers.b);
        addVia(doc, lr, { x: jx, y: rlA.y + 90 }, copper);
        addTrack(doc, lr, { x: jx, y: rlA.y + 90 }, { x: jx, y: rlA.y }, 12, layers.f);
        addTrack(doc, lr, { x: jx, y: rlA.y }, rlA, 12, layers.f);
      }
    }
    if (la !== null && c.ledr !== null && c.led !== null) {
      const rlB = firstPadOnNet(c.ledr, la.id);
      const dA = firstPadOnNet(c.led, la.id);
      if (rlB !== null && dA !== null) {
        const e1 = esc(doc, la, rlB, 0, 70, 12, layers, copper);
        const e2 = esc(doc, la, dA, 0, 70, 12, layers, copper);
        addTrack(doc, la, e1, e2, 12, layers.b);
      }
    }

    if (vcc !== null) {
      addVia(doc, vcc, { x: vccFeedX, y: vccBusY }, copper);
    }
    if (gnd !== null) {
      addVia(doc, gnd, { x: gndFeedL, y: gndBusY }, copper);
    }
  }

  // J1 电源抽头
  if (j1 !== null) {
    if (gnd !== null) {
      const jGnd = firstPadOnNet(j1, gnd.id);
      if (jGnd !== null) {
        const e = esc(doc, gnd, jGnd, -50, 0, 14, layers, copper);
        addTrack(doc, gnd, e, { x: e.x, y: gndBusY - 50 }, 14, layers.b);
        addVia(doc, gnd, { x: e.x, y: gndBusY - 50 }, copper);
        addTrack(doc, gnd, { x: e.x, y: gndBusY - 50 }, { x: e.x, y: gndBusY }, 14, layers.gndV);
        addVia(doc, gnd, { x: e.x, y: gndBusY }, copper);
        addTrack(doc, gnd, { x: e.x, y: gndBusY }, { x: x1, y: gndBusY }, 14, layers.gndH);
      }
    }
    if (vcc !== null) {
      const jVcc = firstPadOnNet(j1, vcc.id);
      if (jVcc !== null) {
        const e = esc(doc, vcc, jVcc, -120, 0, 14, layers, copper);
        addTrack(doc, vcc, e, { x: e.x, y: vccBusY + 50 }, 14, layers.b);
        addVia(doc, vcc, { x: e.x, y: vccBusY + 50 }, copper);
        addTrack(doc, vcc, { x: e.x, y: vccBusY + 50 }, { x: e.x, y: vccBusY }, 14, layers.vccV);
        addVia(doc, vcc, { x: e.x, y: vccBusY }, copper);
        addTrack(doc, vcc, { x: e.x, y: vccBusY }, { x: x1, y: vccBusY }, 14, layers.vccH);
      }
    }
  }

  const tracksAdded = doc.tracks.length - tracks0;
  const viasAdded = doc.vias.length - vias0;
  const reason =
    `mcu_hand_cu clusters=${packs.length} Cu=${copper.length} ` +
    `trk=${tracksAdded} via=${viasAdded}`;
  tracePcb('MCU_HAND_CU', reason);
  return {
    applied: tracksAdded > 0 || viasAdded > 0,
    tracksAdded: tracksAdded,
    viasAdded: viasAdded,
    clusters: packs.length,
    reason: reason
  };
}
