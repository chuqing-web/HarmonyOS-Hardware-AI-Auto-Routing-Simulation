export class MinHeap<T> {
    private data: T[] = [];
    private compareFn: (a: T, b: T) => number;
    constructor(u43: (a: T, b: T) => number) {
        this.compareFn = u43;
    }
    push(t43: T): void {
        this.data.push(t43);
        this.bubbleUp(this.data.length - 1);
    }
    pop(): T | null {
        if (this.data.length === 0) {
            return null;
        }
        const r43 = this.data[0];
        const s43 = this.data[this.data.length - 1];
        this.data[0] = s43;
        this.data.pop();
        if (this.data.length > 0) {
            this.bubbleDown(0);
        }
        return r43;
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
    private bubbleUp(n43: number): void {
        let o43 = n43;
        while (o43 > 0) {
            const p43 = Math.floor((o43 - 1) / 2);
            if (this.compareFn(this.data[o43], this.data[p43]) >= 0) {
                break;
            }
            const q43 = this.data[o43];
            this.data[o43] = this.data[p43];
            this.data[p43] = q43;
            o43 = p43;
        }
    }
    private bubbleDown(g43: number): void {
        let h43 = g43;
        const i43 = this.data.length;
        while (true) {
            const j43 = 2 * h43 + 1;
            const k43 = 2 * h43 + 2;
            let l43 = h43;
            if (j43 < i43 && this.compareFn(this.data[j43], this.data[l43]) < 0) {
                l43 = j43;
            }
            if (k43 < i43 && this.compareFn(this.data[k43], this.data[l43]) < 0) {
                l43 = k43;
            }
            if (l43 === h43) {
                break;
            }
            const m43 = this.data[h43];
            this.data[h43] = this.data[l43];
            this.data[l43] = m43;
            h43 = l43;
        }
    }
}
