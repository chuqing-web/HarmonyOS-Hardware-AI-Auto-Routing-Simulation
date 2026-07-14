import webSocket from "@ohos:net.webSocket";
import { Logger, EventBus, ModuleEvent } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { CollabConflictResolver } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/collaboration/CollabConflictResolver";
import type { CollabOp } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/collaboration/CollabConflictResolver";
export interface CollabPresence {
    userId: string;
    userName: string;
    cursorX: number;
    cursorY: number;
    color: string;
}
export interface CollabSyncMessage {
    type: 'op' | 'cursor' | 'lock' | 'ping';
    sessionId: string;
    payload: object;
    vectorClock: number[];
}
interface CursorPayload {
    x: number;
    y: number;
    userName: string;
}
export class CollabSyncClient {
    private ws: webSocket.WebSocket | null = null;
    private connected: boolean = false;
    private sessionId: string = '';
    private vectorClock: number[] = [0, 0];
    private presence: Map<string, CollabPresence> = new Map();
    private resolver: CollabConflictResolver = new CollabConflictResolver();
    private url: string = '';
    private userId: string = '';
    private userName: string = '';
    setSession(f341: string, g341: string): void {
        this.userId = f341;
        this.userName = g341;
    }
    connect(z340: string, a341: string): Promise<boolean> {
        this.url = z340;
        this.sessionId = a341;
        return new Promise((b341) => {
            try {
                this.ws = webSocket.createWebSocket();
                this.ws.on('open', () => {
                    this.connected = true;
                    Logger.info('collab', `connected ${z340}`);
                    b341(true);
                });
                this.ws.on('message', (d341, e341) => {
                    if (d341 || !e341)
                        return;
                    this.onMessage(`${e341}`);
                });
                this.ws.on('close', () => { this.connected = false; });
                this.ws.on('error', () => { this.connected = false; b341(false); });
                this.ws.connect(z340);
            }
            catch (c341) {
                b341(false);
            }
        });
    }
    broadcastOp(w340: CollabOp): void {
        if (!this.connected || !this.ws)
            return;
        this.vectorClock[0]++;
        const x340: CollabSyncMessage = {
            type: 'op',
            sessionId: this.sessionId,
            payload: w340 as object,
            vectorClock: this.vectorClock.slice()
        };
        try {
            this.ws.send(JSON.stringify(x340));
        }
        catch (y340) { }
    }
    broadcastCursor(q340: number, r340: number, s340?: string): void {
        if (!this.connected || !this.ws)
            return;
        const t340: CursorPayload = { x: q340, y: r340, userName: s340 ?? this.userName };
        const u340: CollabSyncMessage = {
            type: 'cursor',
            sessionId: this.sessionId,
            payload: t340 as object,
            vectorClock: this.vectorClock.slice()
        };
        try {
            this.ws.send(JSON.stringify(u340));
        }
        catch (v340) { }
    }
    getPresence(): CollabPresence[] {
        return Array.from(this.presence.values());
    }
    disconnect(): void {
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch (p340) { }
            this.ws = null;
        }
        this.connected = false;
    }
    isConnected(): boolean {
        return this.connected;
    }
    private onMessage(j340: string): void {
        try {
            const l340 = JSON.parse(j340) as CollabSyncMessage;
            if (l340.type === 'op') {
                const n340 = l340.payload as CollabOp;
                const o340 = this.resolver.merge(n340, this.vectorClock, l340.vectorClock);
                if (o340) {
                    EventBus.getInstance().publish({
                        event: ModuleEvent.SCHEMATIC_CHANGED,
                        source: 'collab_sync',
                        timestamp: Date.now(),
                        data: n340
                    });
                }
            }
            else if (l340.type === 'cursor') {
                const m340 = l340.payload as Record<string, string | number>;
                this.presence.set(l340.sessionId, {
                    userId: l340.sessionId,
                    userName: `${m340['userName']}`,
                    cursorX: Number(m340['x']),
                    cursorY: Number(m340['y']),
                    color: '#4A9EFF'
                });
            }
        }
        catch (k340) { }
    }
}
