import preferences from "@ohos:data.preferences";
const PREFS = 'elecdraw_privacy';
const KEY_CONSENT = 'privacy_consent_v1';
const CONSENT_VERSION = '1.0.0';
export interface PrivacyConsentRecord {
    accepted: boolean;
    version: string;
    acceptedAt: number;
}
export class PrivacyConsentStore {
    private static prefs: preferences.Preferences | null = null;
    static async init(l11: Context): Promise<void> {
        try {
            PrivacyConsentStore.prefs = await preferences.getPreferences(l11, PREFS);
        }
        catch (m11) { }
    }
    static async hasConsent(): Promise<boolean> {
        if (!PrivacyConsentStore.prefs)
            return false;
        try {
            const k11 = await PrivacyConsentStore.prefs.get(KEY_CONSENT, '') as string;
            return k11 === CONSENT_VERSION;
        }
        catch (j11) {
            return false;
        }
    }
    static async recordConsent(): Promise<void> {
        if (!PrivacyConsentStore.prefs)
            return;
        try {
            await PrivacyConsentStore.prefs.put(KEY_CONSENT, CONSENT_VERSION);
            await PrivacyConsentStore.prefs.put('accepted_at', Date.now());
            await PrivacyConsentStore.prefs.flush();
        }
        catch (i11) { }
    }
    static async getRecord(): Promise<PrivacyConsentRecord> {
        const f11 = await PrivacyConsentStore.hasConsent();
        let g11 = 0;
        if (PrivacyConsentStore.prefs) {
            try {
                g11 = await PrivacyConsentStore.prefs.get('accepted_at', 0) as number;
            }
            catch (h11) { }
        }
        return { accepted: f11, version: CONSENT_VERSION, acceptedAt: g11 };
    }
}
