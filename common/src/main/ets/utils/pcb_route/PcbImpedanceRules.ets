/**
 * 叠层感知阻抗 → 建议线宽（微带近似），供规则引擎深度耦合。
 * Z0≈50Ω 单端；差分对用略窄线宽保持 ~90–100Ω 目标的工程近似。
 */
import {
  PcbDocument, PcbLayerId, PcbStackLayerType, copperLayersFromStack
} from '../../types/PcbTypes';

/** mil */
function mmToMil(mm: number): number {
  return mm * 1000 / 25.4;
}

/**
 * 微带：给定目标阻抗求线宽 (mil)。
 * 公式: Z = 87/√(εr+1.41) * ln(5.98*h/(0.8*w+t))
 */
export function microstripWidthForZ(
  zOhms: number,
  hMil: number,
  er: number,
  tMil: number
): number {
  if (zOhms < 10 || hMil < 0.1) {
    return 10;
  }
  const k = 87 / Math.sqrt(er + 1.41);
  // ln(5.98*h/(0.8w+t)) = Z/k  →  5.98*h/(0.8w+t) = exp(Z/k)
  const expTerm = Math.exp(zOhms / k);
  if (expTerm < 1.01) {
    return hMil * 2;
  }
  const denom = 5.98 * hMil / expTerm;
  const w = (denom - tMil) / 0.8;
  if (!(w > 0) || w > hMil * 20) {
    return Math.max(6, hMil * 1.5);
  }
  return Math.max(4, Math.min(w, 80));
}

interface RefDielectric {
  hMil: number;
  er: number;
  tMil: number;
}

function dielectricAboveCopper(doc: PcbDocument, copperId: PcbLayerId): RefDielectric {
  const layers = doc.layerStack?.layers ?? [];
  let tMil = mmToMil(0.035);
  let hMil = mmToMil(0.2);
  let er = 4.5;
  let foundCu = false;
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    if (L.type === PcbStackLayerType.COPPER && L.copperLayerId === copperId) {
      foundCu = true;
      if (L.copperOz !== undefined && L.copperOz > 0) {
        tMil = mmToMil(0.035 * L.copperOz);
      } else if (L.thicknessMm > 0) {
        tMil = mmToMil(L.thicknessMm);
      }
      // 向上找最近介质（更靠近元件侧参考）或向下
      for (let j = i - 1; j >= 0; j--) {
        if (layers[j].type === PcbStackLayerType.DIELECTRIC) {
          hMil = mmToMil(Math.max(layers[j].thicknessMm, 0.05));
          er = layers[j].dielectricDk ?? 4.5;
          break;
        }
      }
      if (hMil <= 0.1) {
        for (let j = i + 1; j < layers.length; j++) {
          if (layers[j].type === PcbStackLayerType.DIELECTRIC) {
            hMil = mmToMil(Math.max(layers[j].thicknessMm, 0.05));
            er = layers[j].dielectricDk ?? 4.5;
            break;
          }
        }
      }
      break;
    }
  }
  if (!foundCu) {
    return { hMil: mmToMil(0.2), er: 4.5, tMil: mmToMil(0.035) };
  }
  return { hMil, er, tMil };
}

/** 单端 50Ω 建议线宽（相对 preferred 铜层） */
export function suggestedWidth50Ohm(doc: PcbDocument, layer: PcbLayerId): number {
  const d = dielectricAboveCopper(doc, layer);
  return microstripWidthForZ(50, d.hMil, d.er, d.tMil);
}

/** 差分对单线建议宽度（目标 Zdiff≈90Ω 的工程折中 → 单端略高于 50） */
export function suggestedDiffTraceWidth(doc: PcbDocument, layer: PcbLayerId): number {
  const d = dielectricAboveCopper(doc, layer);
  // 用 ~55Ω 单端近似紧耦合差分对单线
  return microstripWidthForZ(55, d.hMil, d.er, d.tMil);
}

/**
 * 规则耦合：netClass 线宽与叠层阻抗建议取合理合成。
 * 电源保持较宽；信号可被阻抗建议收窄/加宽（夹在 minTrack～2×netClass）。
 */
export function resolveTrackWidth(
  doc: PcbDocument,
  netId: string,
  netName: string,
  layer: PcbLayerId,
  isDiff: boolean,
  isPower: boolean,
  netClassWidth: number,
  defaultWidth: number
): number {
  const minW = doc.metadata.designRules.minTrackWidth;
  let base = netClassWidth > 0 ? netClassWidth : defaultWidth;
  if (isPower) {
    return Math.max(base, defaultWidth * 2, 20, minW);
  }
  const copper = copperLayersFromStack(doc.layerStack);
  const useLayer = copper.length > 0 ? layer : PcbLayerId.F_CU;
  const zW = isDiff ? suggestedDiffTraceWidth(doc, useLayer) : suggestedWidth50Ohm(doc, useLayer);
  // 与 netClass 加权：可按阻抗略收窄；禁止显著加宽（~38mil 会堵死密集板走廊）
  const mixed = base * 0.55 + zW * 0.45;
  const lo = Math.max(minW, base * 0.55);
  const hi = Math.max(base * 1.08, minW);
  if (mixed < lo) {
    return lo;
  }
  if (mixed > hi) {
    return hi;
  }
  return mixed;
}
