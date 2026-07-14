/**
 * Launch-time window sizing — immersive layout without SessionManager-only maximize APIs.
 */
import { window } from '@kit.ArkUI';
import { common } from '@kit.AbilityKit';

/**
 * Expand the main window for lab / 2in1 use.
 * Uses setWindowLayoutFullScreen (WindowManager.Core) instead of maximize /
 * MaximizePresentation (SessionManager), which is not available on all deviceTypes
 * and triggers ArkTS syscap compile warnings.
 */
export async function maximizeAppWindow(ctx?: common.UIAbilityContext,
  stage?: window.WindowStage): Promise<void> {
  try {
    let mainWindow: window.Window;
    if (stage !== undefined) {
      mainWindow = await stage.getMainWindow();
    } else if (ctx !== undefined) {
      mainWindow = await window.getLastWindow(ctx);
    } else {
      return;
    }
    await mainWindow.setWindowLayoutFullScreen(true);
  } catch (_e) {
    // Best-effort — unsupported environments keep the default window size.
  }
}
