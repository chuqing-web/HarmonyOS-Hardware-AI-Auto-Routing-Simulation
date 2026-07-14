import deviceInfo from "@ohos:deviceInfo";
import { CryptoUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/CryptoUtil";
export class HardwareFingerprint {
    static collect(): string {
        let l9 = 'unknown';
        let m9 = 'unknown';
        try {
            l9 = HardwareFingerprint.safe(deviceInfo.serial);
        }
        catch (p9) { }
        try {
            m9 = HardwareFingerprint.safe(deviceInfo.udid);
        }
        catch (o9) { }
        const n9: string[] = [
            HardwareFingerprint.safe(deviceInfo.productModel),
            HardwareFingerprint.safe(deviceInfo.hardwareModel),
            l9,
            m9,
            HardwareFingerprint.safe(deviceInfo.brand),
            HardwareFingerprint.safe(deviceInfo.marketName)
        ];
        return n9.join('|');
    }
    static getDeviceCode(): string {
        const j9 = HardwareFingerprint.collect();
        const k9 = CryptoUtil.hash(j9);
        return k9.substring(0, 32).toUpperCase();
    }
    private static safe(i9: string | undefined): string {
        return i9 && i9.length > 0 ? i9 : 'unknown';
    }
}
