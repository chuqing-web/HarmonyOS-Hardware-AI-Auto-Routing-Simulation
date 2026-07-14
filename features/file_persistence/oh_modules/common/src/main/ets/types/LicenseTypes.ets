/**
 * 授权、激活、计费类型定义
 */

export enum LicenseTier {
  FREE = 'free',
  PERSONAL_PRO = 'personal_pro',
  ENTERPRISE = 'enterprise',
  EDUCATION = 'education'
}

export interface LicenseFeatures {
  maxDevices: number;
  dailyAiCalls: number;
  maxAiApis: number;
  stm32AdvancedPeriph: boolean;
  monteCarlo: boolean;
  faultInjection: boolean;
  pluginSystem: boolean;
  projectEncryption: boolean;
  multiMonitorLayout: boolean;
  teamAnnotation: boolean;
  versionCompare: boolean;
  batchBomExport: boolean;
}

export interface LicenseFile {
  tier: LicenseTier;
  licensee: string;
  deviceCode: string;
  issuedAt: string;
  expiresAt: string;
  offlineDays: number;
  features: LicenseFeatures;
  signature: string;
}

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  deviceMatched: boolean;
  expired: boolean;
  daysRemaining: number;
  message: string;
}

export interface ApiUsageRecord {
  apiId: string;
  providerName: string;
  dailyCalls: number;
  dailyTokens: number;
  lastCallAt: string;
}

export interface UsageDashboard {
  tier: LicenseTier;
  globalDailyCalls: number;
  globalDailyLimit: number;
  globalDailyTokens: number;
  usagePercent: number;
  warningTriggered: boolean;
  perApi: ApiUsageRecord[];
  billingNote: string;
}
