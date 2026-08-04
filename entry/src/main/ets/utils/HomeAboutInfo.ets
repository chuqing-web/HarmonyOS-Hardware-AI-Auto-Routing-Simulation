/**
 * HomePage About 面板 — Proteus 风格系统/授权信息
 */
import deviceInfo from '@ohos.deviceInfo';
import hidebug from '@ohos.hidebug';
import { APP_VERSION_CODE, APP_VERSION_NAME, LicenseManager, LicenseTier } from 'common';
import { AppService } from '../services/AppService';

export interface HomeAboutSnapshot {
  copyrightLine: string;
  releaseLine: string;
  /** About 面板展示用（通常不含协议头） */
  websiteLine: string;
  /** 浏览器跳转用完整 HTTPS URL */
  websiteUrl: string;
  registeredToLine: string;
  customerNumberLine: string;
  licenseExpiresLine: string;
  /** Free / Pro (GitHub Star) / 正式授权 */
  licenseTierLine: string;
  freeMemoryLine: string;
  platformLine: string;
  isEvaluation: boolean;
  isStarPro: boolean;
}

/** 官方公告 / 产品站（GitHub Pages） */
export const HOME_OFFICIAL_WEBSITE_HOST: string =
  'chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web';

export const HOME_OFFICIAL_WEBSITE_URL: string =
  `https://${HOME_OFFICIAL_WEBSITE_HOST}/`;

export function defaultHomeAboutSnapshot(): HomeAboutSnapshot {
  return {
    copyrightLine: 'AI-SCH Simulator 2024–2026',
    releaseLine: `Release ${APP_VERSION_NAME} SP0 (Build ${APP_VERSION_CODE}) with Advanced Simulation`,
    websiteLine: HOME_OFFICIAL_WEBSITE_HOST,
    websiteUrl: HOME_OFFICIAL_WEBSITE_URL,
    registeredToLine: 'Free User',
    customerNumberLine: '—',
    licenseExpiresLine: '—',
    licenseTierLine: 'Free',
    freeMemoryLine: '—',
    platformLine: 'HarmonyOS',
    isEvaluation: true,
    isStarPro: false
  };
}

export function collectHomeAboutInfo(appService: AppService): HomeAboutSnapshot {
  const licMgr = LicenseManager.getInstance();
  const licensee = licMgr.getLicenseeName();
  const isEvaluation = licMgr.isEvaluationMode();
  const isStarPro = licMgr.isStarUnlocked();
  const tier = licMgr.getTier();
  let licenseTierLine = 'Free';
  if (tier === LicenseTier.ENTERPRISE) {
    licenseTierLine = 'Enterprise';
  } else if (tier === LicenseTier.EDUCATION) {
    licenseTierLine = 'Education';
  } else if (tier === LicenseTier.PERSONAL_PRO) {
    licenseTierLine = isStarPro ? 'Pro (GitHub Star)' : 'Pro';
  }

  return {
    copyrightLine: 'AI-SCH Simulator 2024–2026',
    releaseLine: `Release ${APP_VERSION_NAME} SP0 (Build ${APP_VERSION_CODE}) with Advanced Simulation`,
    websiteLine: HOME_OFFICIAL_WEBSITE_HOST,
    websiteUrl: HOME_OFFICIAL_WEBSITE_URL,
    registeredToLine: licensee.length > 0 ? licensee : (isEvaluation ? 'Free User' : resolveRegisteredFallback()),
    customerNumberLine: formatCustomerNumber(appService.getDeviceCode()),
    licenseExpiresLine: licMgr.getLicenseExpiryLabel(),
    licenseTierLine: licenseTierLine,
    freeMemoryLine: formatFreeMemory(readFreeMemoryMb()),
    platformLine: formatPlatformLine(),
    isEvaluation: isEvaluation,
    isStarPro: isStarPro
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
  return 'AI-SCH User';
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
