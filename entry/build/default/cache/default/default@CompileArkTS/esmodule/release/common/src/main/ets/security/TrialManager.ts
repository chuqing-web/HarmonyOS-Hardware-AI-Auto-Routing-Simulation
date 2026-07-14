import preferences from "@ohos:data.preferences";
import { LicenseTier } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/LicenseTypes";
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
    static async init(s11: Context): Promise<void> {
        try {
            TrialManager.prefs = await preferences.getPreferences(s11, PREFS_NAME);
            const u11 = await TrialManager.prefs.get(KEY_FIRST_RUN, 0) as number;
            if (u11 === 0) {
                await TrialManager.prefs.put(KEY_FIRST_RUN, Date.now());
                await TrialManager.prefs.flush();
            }
        }
        catch (t11) { }
    }
    static async getStatus(): Promise<TrialStatus> {
        if (!TrialManager.prefs) {
            return { active: false, daysRemaining: 0, expired: true, firstRunAt: 0 };
        }
        try {
            const o11 = await TrialManager.prefs.get(KEY_FIRST_RUN, Date.now()) as number;
            const p11 = Date.now() - o11;
            const q11 = Math.floor(p11 / (24 * 60 * 60 * 1000));
            const r11 = Math.max(0, TRIAL_DAYS - q11);
            return {
                active: r11 > 0,
                daysRemaining: r11,
                expired: r11 <= 0,
                firstRunAt: o11
            };
        }
        catch (n11) {
            return { active: false, daysRemaining: 0, expired: true, firstRunAt: 0 };
        }
    }
    static trialTier(): LicenseTier {
        return LicenseTier.PERSONAL_PRO;
    }
}
