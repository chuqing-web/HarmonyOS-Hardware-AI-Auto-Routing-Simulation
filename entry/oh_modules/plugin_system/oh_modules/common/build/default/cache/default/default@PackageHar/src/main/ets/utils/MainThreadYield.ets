/**
 * 主线程协作让出 — 避免 Harmony THREAD_BLOCK_3S/6S。
 * UV 定时器让出（勿用 setTimeout(0) 忙等）。
 */
export class MainThreadYield {
  /** 让出主线程至少 1ms，供 vSync / 输入 / watchdog 推进 */
  static async yield(): Promise<void> {
    await new Promise<void>((resolve: (v: void) => void) => {
      setTimeout((): void => {
        resolve();
      }, 1);
    });
  }
}
