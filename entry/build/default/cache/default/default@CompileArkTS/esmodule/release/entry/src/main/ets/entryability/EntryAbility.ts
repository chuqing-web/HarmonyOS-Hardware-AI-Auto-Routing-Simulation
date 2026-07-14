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
    onCreate(r172: Want, s172: AbilityConstant.LaunchParam): void {
        try {
            this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
        }
        catch (t172) { }
        hilog.info(DOMAIN, TAG, 'AI-SCH Simulator started');
    }
    onDestroy(): void {
        hilog.info(DOMAIN, TAG, 'AI-SCH Simulator destroyed');
    }
    onWindowStageCreate(p172: window.WindowStage): void {
        p172.loadContent('pages/SplashPage', (q172) => {
            if (q172.code) {
                hilog.error(DOMAIN, TAG, 'Failed to load SplashPage: %{public}s', JSON.stringify(q172));
                return;
            }
            hilog.info(DOMAIN, TAG, 'SplashPage loaded');
            void maximizeAppWindow(undefined, p172);
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
        try {
            const o172: AppService = AppService.getInstance();
            void o172.saveRecoveryCache();
            if (o172.currentProjectPath.length > 0) {
                void o172.saveSession(o172.currentProjectPath, o172.currentProject?.name ?? 'Untitled', false);
            }
        }
        catch (n172) {
        }
    }
}
