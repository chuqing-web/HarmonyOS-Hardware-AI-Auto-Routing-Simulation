import window from "@ohos:window";
import type common from "@ohos:app.ability.common";
export async function maximizeAppWindow(r251?: common.UIAbilityContext, s251?: window.WindowStage): Promise<void> {
    try {
        let u251: window.Window;
        if (s251 !== undefined) {
            u251 = await s251.getMainWindow();
        }
        else if (r251 !== undefined) {
            u251 = await window.getLastWindow(r251);
        }
        else {
            return;
        }
        await u251.setWindowLayoutFullScreen(true);
    }
    catch (t251) {
    }
}
