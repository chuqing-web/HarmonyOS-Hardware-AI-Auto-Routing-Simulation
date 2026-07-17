/**
 * 应用版本号 — 与 AppScope/app.json5 的 versionName / versionCode 保持一致。
 * 发版时请同步修改此处与 app.json5。
 */
export const APP_VERSION_NAME: string = '1.1.0';
export const APP_VERSION_CODE: number = 1001000;

export function appVersionLabel(): string {
  return `${APP_VERSION_NAME}(${APP_VERSION_CODE})`;
}
