import window from "@ohos:window";
import type common from "@ohos:app.ability.common";
/**
 * Expand the main window to the last maximized / large desktop size.
 * Prefer maximize() (PC/2in1) over layout-fullscreen (immersive mobile).
 * Also enables window-rect auto-save when a WindowStage is provided.
 */
export async function maximizeAppWindow(ctx?: common.UIAbilityContext, stage?: window.WindowStage): Promise<void> {
    try {
        let mainWindow: window.Window;
        if (stage !== undefined) {
            mainWindow = await stage.getMainWindow();
            try {
                // Restore previous desktop window size on next launch (2in1 / PC).
                await stage.setWindowRectAutoSave(true);
            }
            catch (_eSave) {
                // Optional API
            }
        }
        else if (ctx !== undefined) {
            mainWindow = await window.getLastWindow(ctx);
        }
        else {
            return;
        }
        // Desktop maximize (keeps system title bar; not immersive fullscreen).
        try {
            await mainWindow.maximize();
            return;
        }
        catch (_eMax) {
            // Fall through
        }
        // Some runtimes expose maximize via different binding — try once more after short delay path noop
        try {
            // Avoid exclusive immersive mode that looks "non-max windowed" or hides chrome oddly.
            await mainWindow.setWindowLayoutFullScreen(false);
        }
        catch (_eFs) {
            // ignore
        }
    }
    catch (_e) {
        // Best-effort — unsupported environments keep the default window size.
    }
}
