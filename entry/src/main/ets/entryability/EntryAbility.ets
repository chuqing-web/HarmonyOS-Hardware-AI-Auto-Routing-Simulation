import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { AppService } from '../services/AppService';
import { ThemeManager } from '../theme/ThemeManager';
import { maximizeAppWindow } from '../utils/WindowLaunchUtil';

const DOMAIN = 0x0000;
const TAG = 'AISchSim';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    // 不写死深色：ColorMode 由 ThemeManager 按用户偏好同步（浅/深）
    try {
      ThemeManager.getInstance().bindApplicationContext(this.context.getApplicationContext());
    } catch (_e) { /* ignore */ }
    hilog.info(DOMAIN, TAG, 'AI-SCH Simulator started');
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'AI-SCH Simulator destroyed');
    try {
      void AppService.getInstance().flushProjectProtection(true);
    } catch (_e) { /* best-effort */ }
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/SplashPage', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'Failed to load SplashPage: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, 'SplashPage loaded');
      void maximizeAppWindow(undefined, windowStage);
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, 'Window stage destroyed');
    try {
      void AppService.getInstance().flushProjectProtection(true);
    } catch (_e) { /* best-effort */ }
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, 'App foreground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, 'App background');
    try {
      void AppService.getInstance().flushProjectProtection(false);
    } catch (_e) { /* best-effort */ }
  }
}
