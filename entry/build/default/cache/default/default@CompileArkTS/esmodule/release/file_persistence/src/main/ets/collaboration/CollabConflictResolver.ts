export interface CollabOp {
    opType: 'device_move' | 'device_add' | 'device_delete' | 'wire_update';
    targetId: string;
    data: Record<string, string | number>;
    timestamp: number;
}
export class CollabConflictResolver {
    private lastOps: Map<string, CollabOp> = new Map();
    merge(b336: CollabOp, c336: number[], d336: number[]): boolean {
        const e336 = `${b336.opType}:${b336.targetId}`;
        const f336 = this.lastOps.get(e336);
        if (f336 && f336.timestamp > b336.timestamp) {
            return false;
        }
        if (d336[0] < c336[0] && f336 !== undefined) {
            return false;
        }
        this.lastOps.set(e336, b336);
        return true;
    }
    applyLww(z335: CollabOp, a336: CollabOp): CollabOp {
        return a336.timestamp >= z335.timestamp ? a336 : z335;
    }
}
