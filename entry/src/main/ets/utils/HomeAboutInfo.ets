/**
 * HomePage About 面板 — Proteus 风格系统/授权信息
 */
import deviceInfo from '@ohos.deviceInfo';
import hidebug from '@ohos.hidebug';
import { APP_VERSION_CODE, APP_VERSION_NAME, LicenseManager } from 'common';
import { AppService } from '../services/AppService';

export interface HomeAboutSnapshot {
  copyrightLine: string;
  releaseLine: string;
  websiteLine: string;
  registeredToLine: string;
  customerNumberLine: string;
  licenseExpiresLine: string;
  freeMemoryLine: string;
  platformLine: string;
  isEvaluation: boolean;
}

export function defaultHomeAboutSnapshot(): HomeAboutSnapshot {
  return {
    copyrightLine: 'AI-SCH Simulator 2024–2026',
    releaseLine: `Release ${APP_VERSION_NAME} SP0 (Build ${APP_VERSION_CODE}) with Advanced Simulation`,
    websiteLine: 'www.elecdraw.local',
    registeredToLine: 'Evaluation User',
    customerNumberLine: '—',
    licenseExpiresLine: '01/01/2130',
    freeMemoryLine: '—',
    platformLine: 'HarmonyOS',
    isEvaluation: true
  };
}

export function collectHomeAboutInfo(appService: AppService): HomeAboutSnapshot {
  const licMgr = LicenseManager.getInstance();
  const status = appService.getLicenseStatus();
  const licensee = licMgr.getLicenseeName();
  const isEvaluation = !status.valid || licMgr.isEvaluationMode();

  return {
    copyrightLine: 'AI-SCH Simulator 2024–2026',
    releaseLine: `Release ${APP_VERSION_NAME} SP0 (Build ${APP_VERSION_CODE}) with Advanced Simulation`,
    websiteLine: 'www.elecdraw.local',
    registeredToLine: licensee.length > 0 ? licensee : resolveRegisteredFallback(),
    customerNumberLine: formatCustomerNumber(appService.getDeviceCode()),
    licenseExpiresLine: licMgr.getLicenseExpiryLabel(),
    freeMemoryLine: formatFreeMemory(readFreeMemoryMb()),
    platformLine: formatPlatformLine(),
    isEvaluation: isEvaluation
  };
}

function resolveRegisteredFallback(): string {
  try {
    const market = deviceInfo.marketName;
    if (market !== undefined && market.length > 0) {
      return market;
    }
    const brand = deviceInfo.brand;
    if (brand !== undefined && brand.length > 0) {
      return brand;
    }
  } catch (_e) { /* ignore */ }
  return 'Evaluation User';
}

/** Proteus 风格客户号：12-11083-810 */
function formatCustomerNumber(code: string): string {
  const raw = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (raw.length < 10) {
    return raw.length > 0 ? raw : '—';
  }
  return `${raw.substring(0, 2)}-${raw.substring(2, 7)}-${raw.substring(7, 10)}`;
}

function toSafeNumber(v: number | bigint | undefined): number {
  if (v === undefined) {
    return 0;
  }
  if (typeof v === 'bigint') {
    return Number(v);
  }
  return v;
}

function readFreeMemoryMb(): number {
  try {
    const info = hidebug.getSystemMemInfo();
    const freeKb = toSafeNumber(info.freeMem);
    if (freeKb <= 0) {
      return -1;
    }
    return Math.round(freeKb / 1024);
  } catch (_e) {
    return -1;
  }
}

function formatFreeMemory(mb: number): string {
  if (mb < 0) {
    return '—';
  }
  return `${formatGroupedNumber(mb)} MB`;
}

function formatGroupedNumber(n: number): string {
  const s = String(n);
  const parts: string[] = [];
  for (let i = s.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    parts.unshift(s.substring(start, i));
  }
  return parts.join(', ');
}

function formatPlatformLine(): string {
  try {
    const os = safeStr(deviceInfo.osFullName);
    const api = safeStr(deviceInfo.sdkApiVersion);
    const build = safeStr(deviceInfo.buildVersion);
    const arch = safeStr(deviceInfo.productModel);
    if (os.length > 0) {
      if (arch.length > 0) {
        return `${os} (${arch}) API ${api}, Build ${build}`;
      }
      return `${os} API ${api}, Build ${build}`;
    }
    return `HarmonyOS API ${api}, Build ${build}`;
  } catch (_e) {
    return 'HarmonyOS';
  }
}

function safeStr(v: string | number | bigint | undefined): string {
  if (v === undefined) {
    return '';
  }
  if (typeof v === 'bigint') {
    return String(v);
  }
  const s = typeof v === 'number' ? String(v) : v;
  return s.length > 0 ? s : '';
}
