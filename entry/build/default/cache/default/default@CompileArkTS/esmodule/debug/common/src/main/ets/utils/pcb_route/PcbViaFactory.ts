import { PcbLayerId, PcbViaKind, copperLayersFromStack } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbVia, PcbTrack } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { Point2D } from '../../types/CommonTypes';
import type { PcbRoutePolicy } from '../../types/PcbAiRouteTypes';
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { findNetClass } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbNetUtil";
import { viaClearAt } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/pcb_route/PcbClearanceOracle";
export function createViaAt(doc: PcbDocument, policy: PcbRoutePolicy, pos: Point2D, netId: string, netName: string, fromLayer?: PcbLayerId, toLayer?: PcbLayerId, existingTracks?: PcbTrack[], existingVias?: PcbVia[]): PcbVia {
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
            }
            else if (lo === 0 || hi === copper.length - 1) {
                kind = PcbViaKind.BLIND;
            }
            else {
                kind = PcbViaKind.BURIED;
            }
        }
    }
    const grid = doc.metadata.gridSize ?? 5;
    let finalPos: Point2D = { x: pos.x, y: pos.y };
    const tracks = existingTracks ?? doc.tracks;
    const vias = existingVias ?? doc.vias;
    if (!viaClearAt(doc, finalPos, netId, diameter, layers, tracks, vias)) {
        const offsets = [
            [grid, 0], [-grid, 0], [0, grid], [0, -grid],
            [grid * 2, 0], [-grid * 2, 0], [0, grid * 2], [0, -grid * 2],
            [grid, grid], [-grid, grid], [grid, -grid], [-grid, -grid]
        ];
        let found = false;
        for (let i = 0; i < offsets.length; i++) {
            const cand: Point2D = { x: pos.x + offsets[i][0], y: pos.y + offsets[i][1] };
            if (viaClearAt(doc, cand, netId, diameter, layers, tracks, vias)) {
                finalPos = cand;
                found = true;
                break;
            }
        }
        if (!found) {
            // 仍放置原位，交由 DRC/QA 处理（避免整网静默丢 via）
            finalPos = { x: pos.x, y: pos.y };
        }
    }
    const via: PcbVia = {
        id: IdUtil.generate('via'),
        position: finalPos,
        drill,
        diameter,
        netId,
        netName,
        layers,
        kind
    };
    return via;
}
