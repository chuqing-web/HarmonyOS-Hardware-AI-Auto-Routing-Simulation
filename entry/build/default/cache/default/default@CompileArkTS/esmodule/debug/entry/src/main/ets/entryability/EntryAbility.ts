import type AbilityConstant from "@ohos:app.ability.AbilityConstant";
import UIAbility from "@ohos:app.ability.UIAbility";
import type Want from "@ohos:app.ability.Want";
import hilog from "@ohos:hilog";
import type window from "@ohos:window";
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { ThemeManager } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { maximizeAppWindow } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/WindowLaunchUtil";
const DOMAIN = 0x0000;
const TAG = 'AISchSim';
export default class EntryAbility extends UIAbility {
    onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
        // 不写死深色：ColorMode 由 ThemeManager 按用户偏好同步（浅/深）
        try {
            ThemeManager.getInstance().bindApplicationContext(this.context.getApplicationContext());
        }
        catch (_e) { /* ignore */ }
        hilog.info(DOMAIN, TAG, 'AI-SCH Simulator started');
    }
    onDestroy(): void {
        hilog.info(DOMAIN, TAG, 'AI-SCH Simulator destroyed');
        try {
            void AppService.getInstance().flushProjectProtection(true);
        }
        catch (_e) { /* best-effort */ }
    }
    onWindowStageCreate(windowStage: window.WindowStage): void {
        // 先最大化再进 Splash，避免首帧布局尺寸抖动（主画布 fit / 启动页过渡更稳）
        void (async () => {
            await maximizeAppWindow(undefined, windowStage);
            windowStage.loadContent('pages/SplashPage', (err) => {
                if (err.code) {
                    hilog.error(DOMAIN, TAG, 'Failed to load SplashPage: %{public}s', JSON.stringify(err));
                    return;
                }
                hilog.info(DOMAIN, TAG, 'SplashPage loaded after maximize');
            });
        })();
    }
    onWindowStageDestroy(): void {
        hilog.info(DOMAIN, TAG, 'Window stage destroyed');
        try {
            void AppService.getInstance().flushProjectProtection(true);
        }
        catch (_e) { /* best-effort */ }
    }
    onForeground(): void {
        hilog.info(DOMAIN, TAG, 'App foreground');
    }
    onBackground(): void {
        hilog.info(DOMAIN, TAG, 'App background');
        try {
            void AppService.getInstance().flushProjectProtection(false);
        }
        catch (_e) { /* best-effort */ }
    }
}
