/**
 * AI 用量统计与配额告警
 */
import {
  FeatureGate, LicenseManager, LicenseTier,
  ApiUsageRecord, UsageDashboard, ErrCode, ResultHelper, ApiResult
} from 'common';

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

  setWarnThreshold(ratio: number): void {
    this.warnThreshold = Math.max(0.5, Math.min(1.0, ratio));
  }

  resetIfNewDay(): void {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const mm = m < 10 ? `0${m}` : `${m}`;
    const dd = d < 10 ? `0${d}` : `${d}`;
    const today = `${y}-${mm}-${dd}`;
    if (this.lastDate !== today) {
      this.globalDailyCalls = 0;
      this.globalDailyTokens = 0;
      this.perApiCalls.clear();
      this.perApiTokens.clear();
      this.lastCallTimes.clear();
      this.warningTriggered = false;
      this.lastDate = today;
    }
  }

  checkBeforeCall(apiId: string, providerName: string): ApiResult<void> {
    this.resetIfNewDay();
    const gate = FeatureGate.canUseAiCall(this.globalDailyCalls);
    if (!gate.success) return gate;
    this.perApiNames.set(apiId, providerName);
    return ResultHelper.ok();
  }

  recordCall(apiId: string, providerName: string, tokensUsed: number = 0): void {
    this.resetIfNewDay();
    this.globalDailyCalls++;
    this.globalDailyTokens += tokensUsed;
    this.perApiCalls.set(apiId, (this.perApiCalls.get(apiId) ?? 0) + 1);
    this.perApiTokens.set(apiId, (this.perApiTokens.get(apiId) ?? 0) + tokensUsed);
    this.perApiNames.set(apiId, providerName);
    this.lastCallTimes.set(apiId, new Date().toISOString());
    const limit = FeatureGate.getFeatures().dailyAiCalls;
    if (limit < Number.MAX_SAFE_INTEGER) {
      const ratio = this.globalDailyCalls / limit;
      if (ratio >= this.warnThreshold) {
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
    const limit = FeatureGate.getFeatures().dailyAiCalls;
    const percent = limit >= Number.MAX_SAFE_INTEGER ? 0 :
      Math.min(100, Math.round((this.globalDailyCalls / limit) * 100));
    const perApi: ApiUsageRecord[] = [];
    this.perApiCalls.forEach((calls: number, apiId: string) => {
      perApi.push({
        apiId,
        providerName: this.perApiNames.get(apiId) ?? apiId,
        dailyCalls: calls,
        dailyTokens: this.perApiTokens.get(apiId) ?? 0,
        lastCallAt: this.lastCallTimes.get(apiId) ?? ''
      });
    });
    const tier = LicenseManager.getInstance().getTier();
    let billingNote = '本地 Ollama 不计费';
    if (tier === LicenseTier.FREE) {
      billingNote = `免费版每日 AI 上限 ${limit} 次`;
    } else if (tier === LicenseTier.ENTERPRISE) {
      billingNote = '企业版无调用上限，支持商用授权';
    }
    return {
      tier,
      globalDailyCalls: this.globalDailyCalls,
      globalDailyLimit: limit,
      globalDailyTokens: this.globalDailyTokens,
      usagePercent: percent,
      warningTriggered: this.warningTriggered,
      perApi,
      billingNote
    };
  }

  isWarningActive(): boolean {
    return this.warningTriggered;
  }
}
