/**
 * 隐私政策同意记录
 */
import preferences from '@ohos.data.preferences';

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

  static async init(context: Context): Promise<void> {
    try {
      PrivacyConsentStore.prefs = await preferences.getPreferences(context, PREFS);
    } catch (_e) { /* prefs not available */ }
  }

  static async hasConsent(): Promise<boolean> {
    if (!PrivacyConsentStore.prefs) return false;
    try {
      const v = await PrivacyConsentStore.prefs.get(KEY_CONSENT, '') as string;
      return v === CONSENT_VERSION;
    } catch (_e) { return false; }
  }

  static async recordConsent(): Promise<void> {
    if (!PrivacyConsentStore.prefs) return;
    try {
      await PrivacyConsentStore.prefs.put(KEY_CONSENT, CONSENT_VERSION);
      await PrivacyConsentStore.prefs.put('accepted_at', Date.now());
      await PrivacyConsentStore.prefs.flush();
    } catch (_e) { /* ignore */ }
  }

  static async getRecord(): Promise<PrivacyConsentRecord> {
    const accepted = await PrivacyConsentStore.hasConsent();
    let at = 0;
    if (PrivacyConsentStore.prefs) {
      try {
        at = await PrivacyConsentStore.prefs.get('accepted_at', 0) as number;
      } catch (_e) { /* ignore */ }
    }
    return { accepted, version: CONSENT_VERSION, acceptedAt: at };
  }
}
