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
    setSession(userId: string, userName: string): void {
        this.userId = userId;
        this.userName = userName;
    }
    connect(url: string, sessionId: string): Promise<boolean> {
        this.url = url;
        this.sessionId = sessionId;
        return new Promise((resolve) => {
            try {
                this.ws = webSocket.createWebSocket();
                this.ws.on('open', () => {
                    this.connected = true;
                    Logger.info('collab', `connected ${url}`);
                    resolve(true);
                });
                this.ws.on('message', (err, data) => {
                    if (err || !data)
                        return;
                    this.onMessage(`${data}`);
                });
                this.ws.on('close', () => { this.connected = false; });
                this.ws.on('error', () => { this.connected = false; resolve(false); });
                this.ws.connect(url);
            }
            catch (_e) {
                resolve(false);
            }
        });
    }
    broadcastOp(op: CollabOp): void {
        if (!this.connected || !this.ws)
            return;
        this.vectorClock[0]++;
        const msg: CollabSyncMessage = {
            type: 'op',
            sessionId: this.sessionId,
            payload: op as object,
            vectorClock: this.vectorClock.slice()
        };
        try {
            this.ws.send(JSON.stringify(msg));
        }
        catch (_e) { /* ignore */ }
    }
    broadcastCursor(x: number, y: number, userName?: string): void {
        if (!this.connected || !this.ws)
            return;
        const cursorPayload: CursorPayload = { x: x, y: y, userName: userName ?? this.userName };
        const msg: CollabSyncMessage = {
            type: 'cursor',
            sessionId: this.sessionId,
            payload: cursorPayload as object,
            vectorClock: this.vectorClock.slice()
        };
        try {
            this.ws.send(JSON.stringify(msg));
        }
        catch (_e) { /* ignore */ }
    }
    getPresence(): CollabPresence[] {
        return Array.from(this.presence.values());
    }
    disconnect(): void {
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch (_e) { /* ignore */ }
            this.ws = null;
        }
        this.connected = false;
    }
    isConnected(): boolean {
        return this.connected;
    }
    private onMessage(text: string): void {
        try {
            const msg = JSON.parse(text) as CollabSyncMessage;
            if (msg.type === 'op') {
                const op = msg.payload as CollabOp;
                const merged = this.resolver.merge(op, this.vectorClock, msg.vectorClock);
                if (merged) {
                    EventBus.getInstance().publish({
                        event: ModuleEvent.SCHEMATIC_CHANGED,
                        source: 'collab_sync',
                        timestamp: Date.now(),
                        data: op
                    });
                }
            }
            else if (msg.type === 'cursor') {
                const p = msg.payload as Record<string, string | number>;
                this.presence.set(msg.sessionId, {
                    userId: msg.sessionId,
                    userName: `${p['userName']}`,
                    cursorX: Number(p['x']),
                    cursorY: Number(p['y']),
                    color: '#4A9EFF'
                });
            }
        }
        catch (_e) { /* ignore */ }
    }
}
