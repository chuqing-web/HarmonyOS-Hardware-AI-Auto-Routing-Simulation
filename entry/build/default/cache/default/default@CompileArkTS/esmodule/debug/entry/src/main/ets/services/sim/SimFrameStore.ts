import { emptySimFrame } from "@bundle:com.elecdraw.aischsim/entry/ets/services/sim/SimProtocol";
import type { SimFramePlain } from "@bundle:com.elecdraw.aischsim/entry/ets/services/sim/SimProtocol";
export class SimFrameStore {
    private latest: SimFramePlain = emptySimFrame();
    private hasUnread: boolean = false;
    private generation: number = 0;
    publish(frame: SimFramePlain): void {
        this.latest = frame;
        this.hasUnread = true;
        this.generation++;
    }
    /** 取最新帧；若无新帧返回 null */
    consumeLatest(): SimFramePlain | null {
        if (!this.hasUnread) {
            return null;
        }
        this.hasUnread = false;
        return this.latest;
    }
    peek(): SimFramePlain {
        return this.latest;
    }
    getGeneration(): number {
        return this.generation;
    }
    clear(): void {
        this.latest = emptySimFrame();
        this.hasUnread = false;
        this.generation = 0;
    }
}
