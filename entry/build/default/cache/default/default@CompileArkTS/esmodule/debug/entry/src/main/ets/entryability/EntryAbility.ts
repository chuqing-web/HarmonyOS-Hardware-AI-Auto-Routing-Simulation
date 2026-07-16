import type AbilityConstant from "@ohos:app.ability.AbilityConstant";
import ConfigurationConstant from "@ohos:app.ability.ConfigurationConstant";
import UIAbility from "@ohos:app.ability.UIAbility";
import type Want from "@ohos:app.ability.Want";
import hilog from "@ohos:hilog";
import type window from "@ohos:window";
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { maximizeAppWindow } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/WindowLaunchUtil";
const DOMAIN = 0x0000;
const TAG = 'AISchSim';
export default class EntryAbility extends UIAbility {
    onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
        try {
            this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
        }
        catch (_e) { /* ignore */ }
        hilog.info(DOMAIN, TAG, 'AI-SCH Simulator started');
    }
    onDestroy(): void {
        hilog.info(DOMAIN, TAG, 'AI-SCH Simulator destroyed');
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
    }
    onForeground(): void {
        hilog.info(DOMAIN, TAG, 'App foreground');
    }
    onBackground(): void {
        hilog.info(DOMAIN, TAG, 'App background');
        // 仅写恢复缓存；勿把 session 标成 dirty，否则下次启动会跳过正式工程导致 API 丢失
        try {
            const appService: AppService = AppService.getInstance();
            void appService.saveRecoveryCache();
            if (appService.currentProjectPath.length > 0) {
                void appService.saveSession(appService.currentProjectPath, appService.currentProject?.name ?? 'Untitled', true);
            }
        }
        catch (e) {
            // Best-effort save, ignore errors
        }
    }
}
