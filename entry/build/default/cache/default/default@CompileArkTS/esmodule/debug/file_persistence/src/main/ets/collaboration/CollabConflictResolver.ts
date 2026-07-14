/**
 * CRDT 风格冲突解决 — 末写入优先 + 向量时钟
 */
export interface CollabOp {
    opType: 'device_move' | 'device_add' | 'device_delete' | 'wire_update';
    targetId: string;
    data: Record<string, string | number>;
    timestamp: number;
}
export class CollabConflictResolver {
    private lastOps: Map<string, CollabOp> = new Map();
    merge(incoming: CollabOp, localClock: number[], remoteClock: number[]): boolean {
        const key = `${incoming.opType}:${incoming.targetId}`;
        const prev = this.lastOps.get(key);
        if (prev && prev.timestamp > incoming.timestamp) {
            return false;
        }
        if (remoteClock[0] < localClock[0] && prev !== undefined) {
            return false;
        }
        this.lastOps.set(key, incoming);
        return true;
    }
    applyLww(local: CollabOp, remote: CollabOp): CollabOp {
        return remote.timestamp >= local.timestamp ? remote : local;
    }
}
