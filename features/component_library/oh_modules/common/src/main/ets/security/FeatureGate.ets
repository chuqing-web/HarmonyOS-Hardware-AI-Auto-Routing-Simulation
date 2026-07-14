/**
 * 功能权限门闸 — 各模块统一入口校验
 */
import { ErrCode } from '../types/ErrCode';
import { LicenseManager } from './LicenseManager';
import { LicenseTier, LicenseFeatures } from '../types/LicenseTypes';
import { ApiResult, ResultHelper } from '../utils/ResultHelper';

export class FeatureGate {
  private static licenseMgr = LicenseManager.getInstance();

  static refresh(): void {
    FeatureGate.licenseMgr = LicenseManager.getInstance();
  }

  static getTier(): LicenseTier {
    return FeatureGate.licenseMgr.getTier();
  }

  static getFeatures(): LicenseFeatures {
    return FeatureGate.licenseMgr.getFeatures();
  }

  static isLicenseValid(): boolean {
    return FeatureGate.licenseMgr.getStatus().valid;
  }

  static canAddDevice(currentCount: number): ApiResult<void> {
    FeatureGate.assertNotTampered();
    const max = FeatureGate.getFeatures().maxDevices;
    if (currentCount >= max) {
      return ResultHelper.fail(
        ErrCode.ERR_FEATURE_LOCKED,
        `免费版单工程最多 ${max} 个器件，请升级专业版`
      );
    }
    return ResultHelper.ok();
  }

  static canUseAiCall(globalDailyCount: number): ApiResult<void> {
    FeatureGate.assertNotTampered();
    const limit = FeatureGate.getFeatures().dailyAiCalls;
    if (globalDailyCount >= limit) {
      return ResultHelper.fail(
        ErrCode.ERR_QUOTA_EXCEEDED,
        `今日 AI 调用已达上限 (${limit})，请升级或明日再试`
      );
    }
    return ResultHelper.ok();
  }

  static canAddAiApi(currentCount: number): ApiResult<void> {
    const max = FeatureGate.getFeatures().maxAiApis;
    if (currentCount >= max) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, `当前版本最多配置 ${max} 个 AI API`);
    }
    return ResultHelper.ok();
  }

  static canUseStm32Advanced(): ApiResult<void> {
    if (!FeatureGate.getFeatures().stm32AdvancedPeriph) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, 'STM32 高级外设需专业版授权');
    }
    return ResultHelper.ok();
  }

  static canUseMonteCarlo(): ApiResult<void> {
    if (!FeatureGate.getFeatures().monteCarlo) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, '蒙特卡洛仿真需专业版授权');
    }
    return ResultHelper.ok();
  }

  static canUseFaultInjection(): ApiResult<void> {
    if (!FeatureGate.getFeatures().faultInjection) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, '故障注入需专业版授权');
    }
    return ResultHelper.ok();
  }

  static canUsePlugins(): ApiResult<void> {
    if (!FeatureGate.getFeatures().pluginSystem) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, '插件系统需专业版授权');
    }
    return ResultHelper.ok();
  }

  static canEncryptProject(): ApiResult<void> {
    if (!FeatureGate.getFeatures().projectEncryption) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, '工程加密需专业版授权');
    }
    return ResultHelper.ok();
  }

  static canUseTeamCollaboration(): ApiResult<void> {
    if (!FeatureGate.getFeatures().teamAnnotation) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, '团队批注需专业版及以上授权');
    }
    return ResultHelper.ok();
  }

  static canUseVersionCompare(): ApiResult<void> {
    if (!FeatureGate.getFeatures().versionCompare) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, '版本对比需专业版及以上授权');
    }
    return ResultHelper.ok();
  }

  static canBatchExportBom(): ApiResult<void> {
    if (!FeatureGate.getFeatures().batchBomExport) {
      return ResultHelper.fail(ErrCode.ERR_FEATURE_LOCKED, '批量 BOM 导出需专业版');
    }
    return ResultHelper.ok();
  }

  private static assertNotTampered(): void {
    if (FeatureGate.licenseMgr.isTampered()) {
      FeatureGate.licenseMgr.getFeatures();
    }
  }
}
