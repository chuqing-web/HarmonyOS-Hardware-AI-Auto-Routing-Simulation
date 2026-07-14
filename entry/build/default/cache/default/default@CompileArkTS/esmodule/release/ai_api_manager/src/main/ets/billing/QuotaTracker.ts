import { FeatureGate, LicenseManager, LicenseTier, ResultHelper } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ApiUsageRecord, UsageDashboard, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class QuotaTracker {
    private static instance: QuotaTracker;
    private globalDailyCalls: number = 0;
    private globalDailyTokens: number = 0;
    private perApiCalls: Map<string, number> = new Map();
    private perApiTokens: Map<string, number> = new Map();
    private perApiNames: Map<string, string> = new Map();
    private lastCallTimes: Map<string, string> = new Map();
    private lastDate: string = '';
    private warnThreshold: number = 0.8;
    private warningTriggered: boolean = false;
    static getInstance(): QuotaTracker {
        if (!QuotaTracker.instance) {
            QuotaTracker.instance = new QuotaTracker();
        }
        return QuotaTracker.instance;
    }
    setWarnThreshold(o257: number): void {
        this.warnThreshold = Math.max(0.5, Math.min(1.0, o257));
    }
    resetIfNewDay(): void {
        const n257 = new Date().toISOString().substring(0, 10);
        if (this.lastDate !== n257) {
            this.globalDailyCalls = 0;
            this.globalDailyTokens = 0;
            this.perApiCalls.clear();
            this.perApiTokens.clear();
            this.lastCallTimes.clear();
            this.warningTriggered = false;
            this.lastDate = n257;
        }
    }
    checkBeforeCall(k257: string, l257: string): ApiResult<void> {
        this.resetIfNewDay();
        const m257 = FeatureGate.canUseAiCall(this.globalDailyCalls);
        if (!m257.success)
            return m257;
        this.perApiNames.set(k257, l257);
        return ResultHelper.ok();
    }
    recordCall(f257: string, g257: string, h257: number = 0): void {
        this.resetIfNewDay();
        this.globalDailyCalls++;
        this.globalDailyTokens += h257;
        this.perApiCalls.set(f257, (this.perApiCalls.get(f257) ?? 0) + 1);
        this.perApiTokens.set(f257, (this.perApiTokens.get(f257) ?? 0) + h257);
        this.perApiNames.set(f257, g257);
        this.lastCallTimes.set(f257, new Date().toISOString());
        const i257 = FeatureGate.getFeatures().dailyAiCalls;
        if (i257 < Number.MAX_SAFE_INTEGER) {
            const j257 = this.globalDailyCalls / i257;
            if (j257 >= this.warnThreshold) {
                this.warningTriggered = true;
            }
        }
    }
    getGlobalDailyCalls(): number {
        this.resetIfNewDay();
        return this.globalDailyCalls;
    }
    getDashboard(): UsageDashboard {
        this.resetIfNewDay();
        const y256 = FeatureGate.getFeatures().dailyAiCalls;
        const z256 = y256 >= Number.MAX_SAFE_INTEGER ? 0 :
            Math.min(100, Math.round((this.globalDailyCalls / y256) * 100));
        const a257: ApiUsageRecord[] = [];
        this.perApiCalls.forEach((d257: number, e257: string) => {
            a257.push({
                apiId: e257,
                providerName: this.perApiNames.get(e257) ?? e257,
                dailyCalls: d257,
                dailyTokens: this.perApiTokens.get(e257) ?? 0,
                lastCallAt: this.lastCallTimes.get(e257) ?? ''
            });
        });
        const b257 = LicenseManager.getInstance().getTier();
        let c257 = '本地 Ollama 不计费';
        if (b257 === LicenseTier.FREE) {
            c257 = `免费版每日 AI 上限 ${y256} 次`;
        }
        else if (b257 === LicenseTier.ENTERPRISE) {
            c257 = '企业版无调用上限，支持商用授权';
        }
        return {
            tier: b257,
            globalDailyCalls: this.globalDailyCalls,
            globalDailyLimit: y256,
            globalDailyTokens: this.globalDailyTokens,
            usagePercent: z256,
            warningTriggered: this.warningTriggered,
            perApi: a257,
            billingNote: c257
        };
    }
    isWarningActive(): boolean {
        return this.warningTriggered;
    }
}
