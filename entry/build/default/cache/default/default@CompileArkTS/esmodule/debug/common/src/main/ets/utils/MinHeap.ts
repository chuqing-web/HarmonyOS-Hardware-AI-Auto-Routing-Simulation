/**
 * 最小二叉堆 — 用于数字仿真事件队列 O(log n) 插入
 */
export class MinHeap<T> {
    private data: T[] = [];
    private compareFn: (a: T, b: T) => number;
    constructor(compareFn: (a: T, b: T) => number) {
        this.compareFn = compareFn;
    }
    push(item: T): void {
        this.data.push(item);
        this.bubbleUp(this.data.length - 1);
    }
    pop(): T | null {
        if (this.data.length === 0) {
            return null;
        }
        const top = this.data[0];
        const last = this.data[this.data.length - 1];
        this.data[0] = last;
        this.data.pop();
        if (this.data.length > 0) {
            this.bubbleDown(0);
        }
        return top;
    }
    peek(): T | null {
        return this.data.length > 0 ? this.data[0] : null;
    }
    get size(): number {
        return this.data.length;
    }
    isEmpty(): boolean {
        return this.data.length === 0;
    }
    clear(): void {
        this.data = [];
    }
    private bubbleUp(index: number): void {
        let i = index;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (this.compareFn(this.data[i], this.data[parent]) >= 0) {
                break;
            }
            const tmp = this.data[i];
            this.data[i] = this.data[parent];
            this.data[parent] = tmp;
            i = parent;
        }
    }
    private bubbleDown(index: number): void {
        let i = index;
        const len = this.data.length;
        while (true) {
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            let smallest = i;
            if (left < len && this.compareFn(this.data[left], this.data[smallest]) < 0) {
                smallest = left;
            }
            if (right < len && this.compareFn(this.data[right], this.data[smallest]) < 0) {
                smallest = right;
            }
            if (smallest === i) {
                break;
            }
            const tmp = this.data[i];
            this.data[i] = this.data[smallest];
            this.data[smallest] = tmp;
            i = smallest;
        }
    }
}
