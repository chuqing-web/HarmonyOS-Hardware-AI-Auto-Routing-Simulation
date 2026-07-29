import type { PcbDocument, PcbNet, PcbNetClass, PcbRatsnestEdge, PcbPad, PcbFootprintInst } from '../types/PcbTypes';
import type { Point2D } from '../types/CommonTypes';
import { padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PcbZoneUtil";
export function guessNetClassId(netName: string, classes: PcbNetClass[]): string {
    const upper = (netName ?? '').toUpperCase();
    let powerId = 'nc_power';
    let signalId = 'nc_signal';
    let defaultId = 'nc_default';
    for (const c of classes) {
        if (c.name === 'Power')
            powerId = c.id;
        if (c.name === 'Signal')
            signalId = c.id;
        if (c.name === 'Default')
            defaultId = c.id;
    }
    if (upper === 'GND' || upper === 'VSS' || upper === 'AGND' ||
        upper.indexOf('VCC') >= 0 || upper.indexOf('VDD') >= 0 ||
        upper.indexOf('3V3') >= 0 || upper.indexOf('5V') >= 0 ||
        upper.indexOf('VIN') >= 0 || upper.indexOf('VBAT') >= 0) {
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
            if (c.id === classId)
                return c;
        }
    }
    for (const c of doc.netClasses) {
        if (c.name === 'Default')
            return c;
    }
    return doc.netClasses[0];
}
/** 从焊盘/走线/过孔重建 nets[] */
export function rebuildPcbNets(doc: PcbDocument): void {
    const map: Map<string, PcbNet> = new Map();
    const add = (netId?: string, netName?: string): void => {
        if (!netId || netId.length === 0)
            return;
        if (map.has(netId))
            return;
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
/** 未连接焊盘对飞线（同网最小生成树边，过滤已有铜连通） */
export function buildRatsnest(doc: PcbDocument): PcbRatsnestEdge[] {
    const nodesByNet: Map<string, PadNode[]> = new Map();
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            if (!pad.netId || pad.netId.length === 0)
                continue;
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
        if (nodes.length < 2)
            return;
        if (isNetFullyConnected(doc, netId, nodes))
            return;
        // Prim MST on pads
        const used: boolean[] = [];
        for (let i = 0; i < nodes.length; i++)
            used.push(false);
        used[0] = true;
        let usedCount = 1;
        while (usedCount < nodes.length) {
            let bestI = -1;
            let bestJ = -1;
            let bestD = Infinity;
            for (let i = 0; i < nodes.length; i++) {
                if (!used[i])
                    continue;
                for (let j = 0; j < nodes.length; j++) {
                    if (used[j])
                        continue;
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
            if (bestJ < 0)
                break;
            used[bestJ] = true;
            usedCount++;
            if (!padsCopperConnected(doc, netId, nodes[bestI].pos, nodes[bestJ].pos)) {
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
function isNetFullyConnected(doc: PcbDocument, netId: string, nodes: PadNode[]): boolean {
    if (nodes.length < 2)
        return true;
    for (let i = 1; i < nodes.length; i++) {
        if (!padsCopperConnected(doc, netId, nodes[0].pos, nodes[i].pos)) {
            return false;
        }
    }
    return true;
}
/** 简化连通：同网铜皮图元端点网格并查集（含 Zone 覆铜） */
function padsCopperConnected(doc: PcbDocument, netId: string, a: Point2D, b: Point2D): boolean {
    const tol = 15;
    const keyOf = (p: Point2D): string => `${Math.round(p.x / tol)}_${Math.round(p.y / tol)}`;
    const parent: Map<string, string> = new Map();
    const find = (k: string): string => {
        let p = parent.get(k) ?? k;
        if (!parent.has(k))
            parent.set(k, k);
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
        if (rx !== ry)
            parent.set(rx, ry);
    };
    const touch = (p: Point2D): void => {
        const k = keyOf(p);
        if (!parent.has(k))
            parent.set(k, k);
    };
    for (const trk of doc.tracks) {
        if (trk.netId !== netId)
            continue;
        touch(trk.start);
        touch(trk.end);
        union(keyOf(trk.start), keyOf(trk.end));
    }
    for (const via of doc.vias) {
        if (via.netId !== netId)
            continue;
        touch(via.position);
    }
    for (const fp of doc.footprints) {
        for (const pad of fp.pads) {
            if (pad.netId !== netId)
                continue;
            touch(padWorldPosition(fp, pad));
        }
    }
    // Zone 覆铜顶点加入连通检测（铜皮可连通同网焊盘）
    for (const z of doc.zones) {
        if (z.netId !== netId)
            continue;
        for (let i = 0; i < z.outline.length; i++) {
            const p = z.outline[i];
            touch(p);
            if (i > 0)
                union(keyOf(z.outline[i - 1]), keyOf(p));
        }
        if (z.outline.length >= 3) {
            union(keyOf(z.outline[z.outline.length - 1]), keyOf(z.outline[0]));
        }
    }
    // 近邻并查（焊盘/过孔与走线端点、Zone 顶点）
    const keys: string[] = [];
    parent.forEach((_v: string, k: string) => {
        keys.push(k);
    });
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const partsI = keys[i].split('_');
            const partsJ = keys[j].split('_');
            if (partsI.length < 2 || partsJ.length < 2)
                continue;
            const dx = Number(partsI[0]) - Number(partsJ[0]);
            const dy = Number(partsI[1]) - Number(partsJ[1]);
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
                union(keys[i], keys[j]);
            }
        }
    }
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (!parent.has(ka) || !parent.has(kb))
        return false;
    return find(ka) === find(kb);
}
/** 正交 L 折线（与画布预览一致） */
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
export function sumTrackLengthForNet(doc: PcbDocument, netId: string): number {
    let len = 0;
    for (const trk of doc.tracks) {
        if (trk.netId !== netId)
            continue;
        const dx = trk.end.x - trk.start.x;
        const dy = trk.end.y - trk.start.y;
        len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
}
export function collectPadWorld(fp: PcbFootprintInst, pad: PcbPad): Point2D {
    return padWorldPosition(fp, pad);
}
