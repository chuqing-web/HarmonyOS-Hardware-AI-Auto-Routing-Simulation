/**
 * 过孔成本与微孔堆叠模型：供迷宫换层代价与 via 几何选型。
 * 对齐路线图阶段四「高级过孔 / 微孔」。
 */
import { PcbDocument, PcbLayerId, PcbViaKind, copperLayersFromStack } from '../../types/PcbTypes';

export interface ViaCostSpec {
  kind: PcbViaKind;
  drill: number;
  diameter: number;
  layers: PcbLayerId[];
  /** 迷宫换层步代价 */
  mazeCost: number;
  stackLevels: number;
  isMicro: boolean;
}

const MICRO_DRILL_MAX = 6;

export function layerSpan(copper: PcbLayerId[], a: PcbLayerId, b: PcbLayerId): number {
  const i = copper.indexOf(a);
  const j = copper.indexOf(b);
  if (i < 0 || j < 0) {
    return 1;
  }
  return Math.abs(i - j);
}

export function classifyViaKind(
  copper: PcbLayerId[],
  from: PcbLayerId,
  to: PcbLayerId
): PcbViaKind {
  const fi = copper.indexOf(from);
  const ti = copper.indexOf(to);
  if (fi < 0 || ti < 0 || from === to) {
    return PcbViaKind.THROUGH;
  }
  const lo = Math.min(fi, ti);
  const hi = Math.max(fi, ti);
  if (lo === 0 && hi === copper.length - 1) {
    return PcbViaKind.THROUGH;
  }
  if (lo === 0 || hi === copper.length - 1) {
    return PcbViaKind.BLIND;
  }
  return PcbViaKind.BURIED;
}

/**
 * 邻层且允许微孔时用小孔径；跨多层用通孔/标准钻。
 */
export function resolveViaGeometry(
  doc: PcbDocument,
  from: PcbLayerId,
  to: PcbLayerId,
  classDrill: number,
  classDia: number
): ViaCostSpec {
  const copper = copperLayersFromStack(doc.layerStack);
  const layersAll = copper.length > 0 ? copper : [PcbLayerId.F_CU, PcbLayerId.B_CU];
  const span = Math.max(1, layerSpan(layersAll, from, to));
  const kind = classifyViaKind(layersAll, from, to);
  const fi = layersAll.indexOf(from);
  const ti = layersAll.indexOf(to);
  let layers: PcbLayerId[] = layersAll.slice();
  if (fi >= 0 && ti >= 0 && from !== to) {
    const lo = Math.min(fi, ti);
    const hi = Math.max(fi, ti);
    layers = [];
    for (let i = lo; i <= hi; i++) {
      layers.push(layersAll[i]);
    }
  }

  const rules = doc.metadata.designRules;
  let drill = classDrill > 0 ? classDrill : rules.minViaDrill;
  let diameter = classDia > 0 ? classDia : rules.minViaDrill + 8;
  // 仅跨 1 层且板≥4 铜：压到微孔孔径
  let isMicro = false;
  if (span === 1 && layersAll.length >= 4) {
    drill = Math.min(drill, MICRO_DRILL_MAX);
    diameter = Math.max(drill + 2 * Math.max(rules.minAnnularRing, 3), drill + 6);
    isMicro = drill <= MICRO_DRILL_MAX;
  }

  // 代价：通孔最高，盲/埋中，微孔单层最低；堆叠层数惩罚
  let mazeCost = 10;
  if (kind === PcbViaKind.THROUGH) {
    mazeCost = 12;
  } else if (kind === PcbViaKind.BLIND) {
    mazeCost = 7;
  } else {
    mazeCost = 8;
  }
  if (isMicro) {
    mazeCost = 4;
  }
  mazeCost += Math.max(0, span - 1) * 3;

  return {
    kind,
    drill,
    diameter,
    layers,
    mazeCost,
    stackLevels: span,
    isMicro
  };
}

/** 迷宫换层代价：同层对为 0（不应调用） */
export function mazeViaTransitionCost(
  doc: PcbDocument,
  from: PcbLayerId,
  to: PcbLayerId
): number {
  if (from === to) {
    return 0;
  }
  const spec = resolveViaGeometry(doc, from, to, 0, 0);
  return spec.mazeCost;
}
