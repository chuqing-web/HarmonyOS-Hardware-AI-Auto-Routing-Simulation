/**
 * 按策略生成过孔 — 不自创层角色；v1 默认通孔全栈
 */
import {
  PcbDocument, PcbLayerId, PcbVia, PcbViaKind, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { PcbRoutePolicy } from '../../types/PcbAiRouteTypes';
import { IdUtil } from '../IdUtil';
import { findNetClass } from '../PcbNetUtil';

export function createViaAt(
  doc: PcbDocument,
  policy: PcbRoutePolicy,
  pos: Point2D,
  netId: string,
  netName: string,
  fromLayer?: PcbLayerId,
  toLayer?: PcbLayerId
): PcbVia {
  const rules = doc.metadata.designRules;
  let diameter = rules.minViaDrill + 8;
  let drill = rules.minViaDrill;
  if (netId.length > 0) {
    for (const n of doc.nets) {
      if (n.id === netId) {
        const nc = findNetClass(doc, n.classId);
        diameter = nc.viaDiameter;
        drill = nc.viaDrill;
        break;
      }
    }
  }

  const copper = copperLayersFromStack(doc.layerStack);
  let layers: PcbLayerId[] = copper.length > 0 ? copper.slice() : [PcbLayerId.F_CU, PcbLayerId.B_CU];
  let kind = PcbViaKind.THROUGH;

  const preferThrough = policy.viaPreference === undefined || policy.viaPreference.preferThrough;
  if (!preferThrough && fromLayer !== undefined && toLayer !== undefined && fromLayer !== toLayer) {
    const fi = copper.indexOf(fromLayer);
    const ti = copper.indexOf(toLayer);
    if (fi >= 0 && ti >= 0) {
      const lo = Math.min(fi, ti);
      const hi = Math.max(fi, ti);
      layers = [];
      for (let i = lo; i <= hi; i++) {
        layers.push(copper[i]);
      }
      if (lo === 0 && hi === copper.length - 1) {
        kind = PcbViaKind.THROUGH;
      } else if (lo === 0 || hi === copper.length - 1) {
        kind = PcbViaKind.BLIND;
      } else {
        kind = PcbViaKind.BURIED;
      }
    }
  }

  const via: PcbVia = {
    id: IdUtil.generate('via'),
    position: { x: pos.x, y: pos.y },
    drill,
    diameter,
    netId,
    netName,
    layers,
    kind
  };
  return via;
}
