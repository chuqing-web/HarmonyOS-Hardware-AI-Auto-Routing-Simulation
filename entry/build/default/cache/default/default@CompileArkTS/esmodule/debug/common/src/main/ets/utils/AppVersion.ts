/**
 * 应用版本号 — 与 AppScope/app.json5 的 versionName / versionCode 保持一致。
 * 真机/模拟器禁止降级安装：改代码后务必递增 versionCode。
 */
export const APP_VERSION_NAME: string = '1.1.1';
export const APP_VERSION_CODE: number = 1001001;
export function appVersionLabel(): string {
    return `${APP_VERSION_NAME}(${APP_VERSION_CODE})`;
}
