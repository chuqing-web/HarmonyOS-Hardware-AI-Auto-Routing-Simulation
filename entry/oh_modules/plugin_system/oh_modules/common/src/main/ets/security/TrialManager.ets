/**
 * 试用期管理 — 首次运行 30 天宽限期
 */
import preferences from '@ohos.data.preferences';
import { LicenseTier } from '../types/LicenseTypes';

const PREFS_NAME = 'elecdraw_license';
const KEY_FIRST_RUN = 'first_run_at_ms';
const TRIAL_DAYS = 30;

export interface TrialStatus {
  active: boolean;
  daysRemaining: number;
  expired: boolean;
  firstRunAt: number;
}

export class TrialManager {
  private static prefs: preferences.Preferences | null = null;

  static async init(context: Context): Promise<void> {
    try {
      TrialManager.prefs = await preferences.getPreferences(context, PREFS_NAME);
      const first = await TrialManager.prefs.get(KEY_FIRST_RUN, 0) as number;
      if (first === 0) {
        await TrialManager.prefs.put(KEY_FIRST_RUN, Date.now());
        await TrialManager.prefs.flush();
      }
    } catch (_e) { /* prefs not available */ }
  }

  static async getStatus(): Promise<TrialStatus> {
    if (!TrialManager.prefs) {
      return { active: false, daysRemaining: 0, expired: true, firstRunAt: 0 };
    }
    try {
      const firstRunAt = await TrialManager.prefs.get(KEY_FIRST_RUN, Date.now()) as number;
      const elapsed = Date.now() - firstRunAt;
      const daysUsed = Math.floor(elapsed / (24 * 60 * 60 * 1000));
      const daysRemaining = Math.max(0, TRIAL_DAYS - daysUsed);
      return {
        active: daysRemaining > 0,
        daysRemaining: daysRemaining,
        expired: daysRemaining <= 0,
        firstRunAt: firstRunAt
      };
    } catch (_e) {
      return { active: false, daysRemaining: 0, expired: true, firstRunAt: 0 };
    }
  }

  static trialTier(): LicenseTier {
    return LicenseTier.PERSONAL_PRO;
  }
}
