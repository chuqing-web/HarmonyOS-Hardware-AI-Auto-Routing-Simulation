import type { ProxyConfig } from 'common';
export class NetworkModeManager {
    private config: ProxyConfig = {
        globalProxy: '',
        systemProxy: false,
        offlineMode: false
    };
    private apiProxies: Map<string, string> = new Map();
    private retryCount: number = 3;
    setGlobalProxy(url: string): void {
        this.config.globalProxy = url;
        // 有自定义代理地址时启用系统代理；清空则直连
        this.config.systemProxy = url.trim().length > 0;
    }
    setApiProxy(apiId: string, url: string): void { this.apiProxies.set(apiId, url); }
    getEffectiveProxy(apiId: string): string {
        if (this.config.offlineMode)
            return '';
        const apiProxy = this.apiProxies.get(apiId);
        if (apiProxy)
            return apiProxy;
        if (this.config.globalProxy)
            return this.config.globalProxy;
        return this.config.systemProxy ? 'system' : '';
    }
    setOfflineMode(enabled: boolean): void {
        this.config.offlineMode = enabled;
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
    handleNetworkFailure(failCount: number): 'retry' | 'fallback' | 'offline' {
        if (this.config.offlineMode)
            return 'offline';
        if (failCount < this.retryCount)
            return 'retry';
        if (failCount < this.retryCount + 2)
            return 'fallback';
        return 'offline';
    }
}
