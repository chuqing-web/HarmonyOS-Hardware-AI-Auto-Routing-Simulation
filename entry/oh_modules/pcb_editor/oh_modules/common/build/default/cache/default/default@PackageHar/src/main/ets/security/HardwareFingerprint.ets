/**
 * 设备硬件指纹采集
 */
import deviceInfo from '@ohos.deviceInfo';
import { CryptoUtil } from '../utils/CryptoUtil';

export class HardwareFingerprint {
  static collect(): string {
    let serial = 'unknown';
    let udid = 'unknown';
    try { serial = HardwareFingerprint.safe(deviceInfo.serial); } catch (_e) { /* no perm */ }
    try { udid = HardwareFingerprint.safe(deviceInfo.udid); } catch (_e) { /* no perm */ }
    const parts: string[] = [
      HardwareFingerprint.safe(deviceInfo.productModel),
      HardwareFingerprint.safe(deviceInfo.hardwareModel),
      serial,
      udid,
      HardwareFingerprint.safe(deviceInfo.brand),
      HardwareFingerprint.safe(deviceInfo.marketName)
    ];
    return parts.join('|');
  }

  static getDeviceCode(): string {
    const raw = HardwareFingerprint.collect();
    const hash = CryptoUtil.hash(raw);
    return hash.substring(0, 32).toUpperCase();
  }

  private static safe(val: string | undefined): string {
    return val && val.length > 0 ? val : 'unknown';
  }
}
