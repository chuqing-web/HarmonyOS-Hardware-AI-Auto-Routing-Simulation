import { PcbViaKind, copperLayersFromStack } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { PcbDocument, PcbLayerId, PcbTrack, PcbVia } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/PcbTypes";
import type { Point2D } from '../../types/CommonTypes';
import type { PcbLayerRole, PcbNetPlanEntry, PcbNetPlanResult, PcbRoutePolicy } from '../../types/PcbAiRouteTypes';
import { IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/IdUtil";
import { pathClearBlockReason, trackWidthForNet, viaClearAt } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/pcb_route/PcbClearanceOracle";
import { tracePcbWarn } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbTraceLog";
export function ensureAllCopperUsed(doc: PcbDocument, tracks: PcbTrack[], zonesCountAsUsed: boolean = true): PcbLayerId[] {
    const copper = copperLayersFromStack(doc.layerStack);
    const used: Set<string> = new Set();
    for (let i = 0; i < tracks.length; i++) {
        used.add(tracks[i].layer as string);
    }
    if (zonesCountAsUsed) {
        for (let i = 0; i < doc.zones.length; i++) {
            used.add(doc.zones[i].layer as string);
        }
    }
    const missing: PcbLayerId[] = [];
    for (let i = 0; i < copper.length; i++) {
        const lid = copper[i];
        if (!used.has(lid as string)) {
            missing.push(lid);
        }
    }
    return missing;
}
function findRoleLayer(policy: PcbRoutePolicy, role: PcbLayerRole): PcbLayerId | null {
    const keys = Object.keys(policy.layerRoles);
    for (let i = 0; i < keys.length; i++) {
        if (policy.layerRoles[keys[i]] === role) {
            return keys[i] as PcbLayerId;
        }
    }
    return null;
}
function pickNetForRole(role: PcbLayerRole, netPlan: PcbNetPlanResult, routed: string[]): PcbNetPlanEntry | null {
    const preferGnd = role === 'gnd_bus';
    const preferPower = role === 'vcc_bus' || role === 'power_h' || role === 'power_v';
    for (let i = 0; i < netPlan.nets.length; i++) {
        const n = netPlan.nets[i];
        if (n.routeMode === 'defer') {
            continue;
        }
        if (preferGnd && n.kind === 'gnd') {
            return n;
        }
        if (preferPower && n.kind === 'power') {
            return n;
        }
    }
    for (let i = 0; i < netPlan.nets.length; i++) {
        const n = netPlan.nets[i];
        if (routed.indexOf(n.netId) >= 0) {
            return n;
        }
    }
    for (let i = 0; i < netPlan.nets.length; i++) {
        if (netPlan.nets[i].routeMode !== 'defer') {
            return netPlan.nets[i];
        }
    }
    return null;
}
/**
 * 为声明但未用到的铜层补真实短段（挂已有电气网）；须过 clearance，失败则跳过该层
 */
export function fillUnusedCopperLayers(doc: PcbDocument, policy: PcbRoutePolicy, netPlan: PcbNetPlanResult, tracks: PcbTrack[], vias: PcbVia[], routedNetIds: string[], missing: PcbLayerId[]): void {
    if (missing.length === 0) {
        return;
    }
    const grid = doc.metadata.gridSize ?? 5;
    const outline = doc.boardOutline?.points ?? [];
    let cx = 100;
    let cy = 100;
    if (outline.length > 0) {
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < outline.length; i++) {
            sx += outline[i].x;
            sy += outline[i].y;
        }
        cx = Math.round(sx / outline.length / grid) * grid;
        cy = Math.round(sy / outline.length / grid) * grid;
    }
    const copperAll = copperLayersFromStack(doc.layerStack);
    for (let mi = 0; mi < missing.length; mi++) {
        const lid = missing[mi];
        const role = policy.layerRoles[lid as string] as PcbLayerRole | undefined;
        if (!role) {
            continue;
        }
        const ne = pickNetForRole(role, netPlan, routedNetIds);
        if (!ne) {
            continue;
        }
        const width = Math.max(trackWidthForNet(doc, ne.netId), grid);
        const horiz = role === 'signal_h' || role === 'power_h' || role === 'gnd_bus' ||
            role === 'vcc_bus' || role === 'stub';
        let placed = false;
        const yBases = [mi * grid * 4, mi * grid * 4 + grid * 10, -mi * grid * 4 - grid * 8];
        for (let yi = 0; yi < yBases.length && !placed; yi++) {
            const yOff = yBases[yi];
            const a: Point2D = horiz
                ? { x: cx - grid * 8, y: cy + yOff }
                : { x: cx + yOff, y: cy - grid * 8 };
            const b: Point2D = horiz
                ? { x: cx + grid * 8, y: cy + yOff }
                : { x: cx + yOff, y: cy + grid * 8 };
            const block = pathClearBlockReason(doc, lid, a, b, ne.netId, width, tracks, vias);
            if (block !== null) {
                continue;
            }
            tracks.push({
                id: IdUtil.generate('trk'),
                layer: lid,
                start: a,
                end: b,
                width,
                netId: ne.netId,
                netName: ne.netName
            });
            const stub = findRoleLayer(policy, 'stub') ?? findRoleLayer(policy, 'signal_h');
            if (stub && stub !== lid) {
                const diameter = doc.metadata.designRules.minViaDrill + 8;
                if (viaClearAt(doc, a, ne.netId, diameter, copperAll, tracks, vias)) {
                    vias.push({
                        id: IdUtil.generate('via'),
                        position: { x: a.x, y: a.y },
                        drill: doc.metadata.designRules.minViaDrill,
                        diameter,
                        netId: ne.netId,
                        netName: ne.netName,
                        layers: copperAll,
                        kind: PcbViaKind.THROUGH
                    });
                }
            }
            placed = true;
        }
        if (!placed) {
            tracePcbWarn('AI_CU_FILL', `skip filler on ${lid as string} — no clear corridor for ${ne.netName}`);
        }
    }
}
