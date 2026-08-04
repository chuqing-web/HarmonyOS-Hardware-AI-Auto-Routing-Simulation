import preferences from "@ohos:data.preferences";
import { LicenseTier } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/LicenseTypes";
const PREFS_NAME = 'elecdraw_license';
const KEY_FIRST_RUN = 'first_run_at_ms';
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
        }
        catch (_e) { /* prefs not available */ }
    }
    /** 试用已取消：始终视为不限权 */
    static async getStatus(): Promise<TrialStatus> {
        let firstRunAt = 0;
        if (TrialManager.prefs) {
            try {
                firstRunAt = await TrialManager.prefs.get(KEY_FIRST_RUN, Date.now()) as number;
            }
            catch (_e) { /* ignore */ }
        }
        return {
            active: false,
            daysRemaining: Number.MAX_SAFE_INTEGER,
            expired: false,
            firstRunAt: firstRunAt
        };
    }
    static trialTier(): LicenseTier {
        return LicenseTier.ENTERPRISE;
    }
}
