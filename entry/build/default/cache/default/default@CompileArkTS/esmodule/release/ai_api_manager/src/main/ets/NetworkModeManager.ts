import type { ProxyConfig } from 'common';
export class NetworkModeManager {
    private config: ProxyConfig = {
        globalProxy: '',
        systemProxy: true,
        offlineMode: false
    };
    private apiProxies: Map<string, string> = new Map();
    private retryCount: number = 3;
    setGlobalProxy(m258: string): void { this.config.globalProxy = m258; }
    setApiProxy(k258: string, l258: string): void { this.apiProxies.set(k258, l258); }
    getEffectiveProxy(i258: string): string {
        if (this.config.offlineMode)
            return '';
        const j258 = this.apiProxies.get(i258);
        if (j258)
            return j258;
        if (this.config.globalProxy)
            return this.config.globalProxy;
        return this.config.systemProxy ? 'system' : '';
    }
    setOfflineMode(h258: boolean): void {
        this.config.offlineMode = h258;
    }
    isOfflineMode(): boolean { return this.config.offlineMode; }
    shouldAllowCloudApi(): boolean { return !this.config.offlineMode; }
    getConfig(): ProxyConfig {
        return {
            globalProxy: this.config.globalProxy,
            systemProxy: this.config.systemProxy,
            offlineMode: this.config.offlineMode
        };
    }
    handleNetworkFailure(g258: number): 'retry' | 'fallback' | 'offline' {
        if (this.config.offlineMode)
            return 'offline';
        if (g258 < this.retryCount)
            return 'retry';
        if (g258 < this.retryCount + 2)
            return 'fallback';
        return 'offline';
    }
}
