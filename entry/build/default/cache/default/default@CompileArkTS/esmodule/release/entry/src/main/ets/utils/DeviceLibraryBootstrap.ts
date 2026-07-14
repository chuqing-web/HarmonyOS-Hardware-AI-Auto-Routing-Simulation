import type common from "@ohos:app.ability.common";
import fs from "@ohos:file.fs";
import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface ResourceManagerLike {
    getRawFileList(path: string): Promise<string[]>;
    getRawFileContent(path: string): Promise<Uint8Array>;
}
const DEVICE_LIBRARY_BOOTSTRAP_VERSION = '2026-07-14-r10k-pin30';
export class DeviceLibraryBootstrap {
    static async ensureLibrary(o239: common.UIAbilityContext, p239: string): Promise<boolean> {
        try {
            const r239 = `${p239}/.bootstrapped`;
            const s239 = !DeviceLibraryBootstrap.dirExists(p239) ||
                !DeviceLibraryBootstrap.fileExists(r239) ||
                DeviceLibraryBootstrap.readText(r239) !== DEVICE_LIBRARY_BOOTSTRAP_VERSION;
            if (!s239) {
                return true;
            }
            fs.mkdirSync(p239, true);
            const t239 = o239.resourceManager as ResourceManagerLike;
            await DeviceLibraryBootstrap.copyRawDir(t239, 'DeviceLibrary', p239);
            const u239 = fs.openSync(r239, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(u239.fd, DEVICE_LIBRARY_BOOTSTRAP_VERSION);
            fs.closeSync(u239);
            Logger.info('component_library', `DeviceLibrary 已引导至 ${p239} (v=${DEVICE_LIBRARY_BOOTSTRAP_VERSION})`);
            return true;
        }
        catch (q239) {
            Logger.info('component_library', `DeviceLibrary 引导失败: ${q239}`);
        }
        return false;
    }
    private static async copyRawDir(a239: object, b239: string, c239: string): Promise<void> {
        const d239 = a239 as ResourceManagerLike;
        const e239 = await d239.getRawFileList(b239);
        for (let f239 = 0; f239 < e239.length; f239++) {
            const g239 = e239[f239];
            const h239 = `${b239}/${g239}`;
            const i239 = `${c239}/${g239}`;
            try {
                const n239 = await d239.getRawFileList(h239);
                if (n239.length > 0) {
                    fs.mkdirSync(i239, true);
                    await DeviceLibraryBootstrap.copyRawDir(d239, h239, i239);
                    continue;
                }
            }
            catch (m239) {
            }
            const j239 = await d239.getRawFileContent(h239);
            try {
                const l239 = fs.openSync(i239, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                fs.writeSync(l239.fd, j239.buffer);
                fs.closeSync(l239);
            }
            catch (k239) {
                Logger.info('component_library', `copy failed: ${i239}`);
            }
        }
    }
    private static dirExists(x238: string): boolean {
        try {
            const z238 = fs.statSync(x238);
            return z238.isDirectory();
        }
        catch (y238) {
            return false;
        }
    }
    private static fileExists(v238: string): boolean {
        try {
            fs.accessSync(v238);
            return true;
        }
        catch (w238) {
            return false;
        }
    }
    private static readText(n238: string): string {
        try {
            const p238 = fs.openSync(n238, fs.OpenMode.READ_ONLY);
            const q238 = fs.statSync(n238);
            const r238 = new ArrayBuffer(q238.size);
            fs.readSync(p238.fd, r238);
            fs.closeSync(p238);
            const s238 = new Uint8Array(r238);
            let t238 = '';
            for (let u238 = 0; u238 < s238.length; u238++) {
                t238 += String.fromCharCode(s238[u238]);
            }
            return t238.trim();
        }
        catch (o238) {
            return '';
        }
    }
}
