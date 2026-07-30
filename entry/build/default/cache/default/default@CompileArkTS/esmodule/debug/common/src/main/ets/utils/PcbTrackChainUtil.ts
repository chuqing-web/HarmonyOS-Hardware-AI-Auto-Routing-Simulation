import type { PcbLayerId, PcbTrack } from '../types/PcbTypes';
import type { Point2D } from '../types/CommonTypes';
export interface PcbTrackPolyline {
    layer: PcbLayerId;
    netId: string;
    netName: string;
    width: number;
    points: Point2D[];
    trackIds: string[];
}
function ptKey(x: number, y: number): string {
    return `${Math.round(x)},${Math.round(y)}`;
}
function samePt(a: Point2D, b: Point2D): boolean {
    return Math.abs(a.x - b.x) < 0.51 && Math.abs(a.y - b.y) < 0.51;
}
function groupKey(t: PcbTrack): string {
    return `${t.layer}|${t.netId}|${Math.round(t.width * 10)}`;
}
/**
 * 把离散 PcbTrack 段合并为折线。T 字接头会拆成多条折线，调用方应在节点画圆角焊盘补齐。
 */
export function buildTrackPolylines(tracks: PcbTrack[]): PcbTrackPolyline[] {
    const out: PcbTrackPolyline[] = [];
    if (tracks.length === 0)
        return out;
    const groups: Map<string, PcbTrack[]> = new Map();
    for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const k = groupKey(t);
        let arr = groups.get(k);
        if (!arr) {
            arr = [];
            groups.set(k, arr);
        }
        arr.push(t);
    }
    groups.forEach((segs: PcbTrack[]) => {
        const used: boolean[] = [];
        for (let i = 0; i < segs.length; i++)
            used.push(false);
        // 端点 → 段下标
        const atPoint: Map<string, number[]> = new Map();
        const addEnd = (x: number, y: number, idx: number): void => {
            const k = ptKey(x, y);
            let list = atPoint.get(k);
            if (!list) {
                list = [];
                atPoint.set(k, list);
            }
            list.push(idx);
        };
        for (let i = 0; i < segs.length; i++) {
            addEnd(segs[i].start.x, segs[i].start.y, i);
            addEnd(segs[i].end.x, segs[i].end.y, i);
        }
        const degree = (x: number, y: number): number => {
            const list = atPoint.get(ptKey(x, y));
            return list !== undefined ? list.length : 0;
        };
        const findNext = (from: Point2D, excludeIdx: number): number => {
            const list = atPoint.get(ptKey(from.x, from.y));
            if (!list)
                return -1;
            for (let j = 0; j < list.length; j++) {
                const idx = list[j];
                if (idx === excludeIdx || used[idx])
                    continue;
                return idx;
            }
            return -1;
        };
        const pickSeed = (): number => {
            // 优先从度数=1 的端点出发，得到最长开链
            for (let i = 0; i < segs.length; i++) {
                if (used[i])
                    continue;
                if (degree(segs[i].start.x, segs[i].start.y) === 1 ||
                    degree(segs[i].end.x, segs[i].end.y) === 1) {
                    return i;
                }
            }
            for (let i = 0; i < segs.length; i++) {
                if (!used[i])
                    return i;
            }
            return -1;
        };
        let guard = 0;
        while (guard++ < segs.length + 2) {
            const seed = pickSeed();
            if (seed < 0)
                break;
            used[seed] = true;
            const seedT = segs[seed];
            const pts: Point2D[] = [
                { x: seedT.start.x, y: seedT.start.y },
                { x: seedT.end.x, y: seedT.end.y }
            ];
            const ids: string[] = [seedT.id];
            // 向终点方向延伸
            let tip = pts[pts.length - 1];
            let prevIdx = seed;
            let extGuard = 0;
            while (extGuard++ < segs.length) {
                // 度数>2 为 T/十字，停止延伸，留给其它折线
                if (degree(tip.x, tip.y) > 2)
                    break;
                const nxt = findNext(tip, prevIdx);
                if (nxt < 0)
                    break;
                used[nxt] = true;
                const t = segs[nxt];
                ids.push(t.id);
                if (samePt(t.start, tip)) {
                    pts.push({ x: t.end.x, y: t.end.y });
                    tip = pts[pts.length - 1];
                }
                else {
                    pts.push({ x: t.start.x, y: t.start.y });
                    tip = pts[pts.length - 1];
                }
                prevIdx = nxt;
            }
            // 向起点方向延伸（往数组头插）
            tip = pts[0];
            prevIdx = seed;
            extGuard = 0;
            while (extGuard++ < segs.length) {
                if (degree(tip.x, tip.y) > 2)
                    break;
                const nxt = findNext(tip, prevIdx);
                if (nxt < 0)
                    break;
                used[nxt] = true;
                const t = segs[nxt];
                ids.unshift(t.id);
                if (samePt(t.start, tip)) {
                    pts.unshift({ x: t.end.x, y: t.end.y });
                }
                else {
                    pts.unshift({ x: t.start.x, y: t.start.y });
                }
                tip = pts[0];
                prevIdx = nxt;
            }
            out.push({
                layer: seedT.layer,
                netId: seedT.netId,
                netName: seedT.netName,
                width: seedT.width,
                points: pts,
                trackIds: ids
            });
        }
    });
    return out;
}
/** 折线所有拐点（含端点），用于画圆角接头填满拐角 */
export function polylineJointPoints(poly: PcbTrackPolyline): Point2D[] {
    return poly.points;
}
