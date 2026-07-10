/**
 * Launch-time window sizing — maximize like the system title-bar button on PC / 2in1.
 */
import { window } from '@kit.ArkUI';
import { common } from '@kit.AbilityKit';

/** Maximize the app main window (ENTER_IMMERSIVE = cover full work area). */
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
    await mainWindow.maximize(window.MaximizePresentation.ENTER_IMMERSIVE);
  } catch (_e) {
    // Best-effort — freeform / unsupported devices keep default window size.
  }
}
