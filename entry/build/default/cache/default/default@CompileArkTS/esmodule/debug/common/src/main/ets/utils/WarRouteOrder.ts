import type { Point2D } from '../types/CommonTypes';
export interface WarOrderPin {
    key: string;
    pt: Point2D;
}
export class WarRouteOrder {
    /** 近邻链最大边长：越小越「局部」，应越先布 */
    static maxNnEdgeLength(pins: WarOrderPin[]): number {
        if (pins.length < 2) {
            return 0;
        }
        const chain = WarRouteOrder.nearestNeighborChain(pins);
        let maxEdge = 0;
        for (let i = 0; i < chain.length - 1; i++) {
            const d = Math.hypot(chain[i + 1].pt.x - chain[i].pt.x, chain[i + 1].pt.y - chain[i].pt.y);
            if (d > maxEdge) {
                maxEdge = d;
            }
        }
        return maxEdge;
    }
    /**
     * 从最左上脚出发的最近邻链（贪心）。
     * 比 nodeList 原序更易得到短边（滞回 IN+→Rf 优先于绕到 Rg）。
     */
    static nearestNeighborChain(pins: WarOrderPin[]): WarOrderPin[] {
        if (pins.length <= 1) {
            return pins.slice();
        }
        let start = 0;
        for (let i = 1; i < pins.length; i++) {
            const a = pins[i].pt;
            const b = pins[start].pt;
            if (a.x < b.x - 0.5 || (Math.abs(a.x - b.x) < 0.5 && a.y < b.y)) {
                start = i;
            }
        }
        const used: boolean[] = [];
        for (let i = 0; i < pins.length; i++) {
            used.push(false);
        }
        const out: WarOrderPin[] = [];
        let cur = start;
        for (let step = 0; step < pins.length; step++) {
            out.push(pins[cur]);
            used[cur] = true;
            if (step === pins.length - 1) {
                break;
            }
            let best = -1;
            let bestD = Number.POSITIVE_INFINITY;
            for (let j = 0; j < pins.length; j++) {
                if (used[j]) {
                    continue;
                }
                const d = Math.hypot(pins[j].pt.x - pins[cur].pt.x, pins[j].pt.y - pins[cur].pt.y);
                if (d < bestD) {
                    bestD = d;
                    best = j;
                }
            }
            if (best < 0) {
                break;
            }
            cur = best;
        }
        return out;
    }
    /**
     * 网索引按「局部优先」排序：maxNnEdge 升序；同距保持稳定。
     * power/ground 呼叫方应先过滤（已有 stub 可跳过）。
     */
    static sortNetIndicesByLocality(maxEdgeByNetIndex: number[]): number[] {
        const idx: number[] = [];
        for (let i = 0; i < maxEdgeByNetIndex.length; i++) {
            idx.push(i);
        }
        idx.sort((a: number, b: number) => {
            const da = maxEdgeByNetIndex[a];
            const db = maxEdgeByNetIndex[b];
            if (da !== db) {
                return da - db;
            }
            return a - b;
        });
        return idx;
    }
    /**
     * 生成多套链顺序：NN、NN 反转、原始。
     * 调用方对每套尝试整网布线，降低单序死锁。
     */
    static chainOrderVariants(pins: WarOrderPin[]): WarOrderPin[][] {
        const nn = WarRouteOrder.nearestNeighborChain(pins);
        const variants: WarOrderPin[][] = [];
        variants.push(nn);
        if (nn.length >= 2) {
            variants.push(nn.slice().reverse());
        }
        let sameAsNn = nn.length === pins.length;
        if (sameAsNn) {
            for (let i = 0; i < pins.length; i++) {
                if (nn[i].key !== pins[i].key) {
                    sameAsNn = false;
                    break;
                }
            }
        }
        if (!sameAsNn) {
            variants.push(pins.slice());
        }
        return variants;
    }
}
