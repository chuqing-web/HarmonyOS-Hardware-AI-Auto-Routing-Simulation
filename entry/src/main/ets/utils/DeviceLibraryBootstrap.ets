/**
 * 从 rawfile 引导 DeviceLibrary 到应用可写目录
 * 带版本标记：rawfile 更新后会强制重新同步，避免旧 pin 几何/符号残留。
 */
import { common } from '@kit.AbilityKit';
import fs from '@ohos.file.fs';
import { Logger } from 'common';

interface ResourceManagerLike {
  getRawFileList(path: string): Promise<string[]>;
  getRawFileContent(path: string): Promise<Uint8Array>;
}

/** 变更 DeviceLibrary 引脚/符号时递增，触发设备侧重拷贝 */
const DEVICE_LIBRARY_BOOTSTRAP_VERSION = '2026-07-27-builtin-full-index';

export class DeviceLibraryBootstrap {
  static async ensureLibrary(context: common.UIAbilityContext, targetRoot: string): Promise<boolean> {
    try {
      const marker = `${targetRoot}/.bootstrapped`;
      const needSync = !DeviceLibraryBootstrap.dirExists(targetRoot) ||
        !DeviceLibraryBootstrap.fileExists(marker) ||
        DeviceLibraryBootstrap.readText(marker) !== DEVICE_LIBRARY_BOOTSTRAP_VERSION;
      if (!needSync) {
        return true;
      }
      // 版本升级时整目录重建，避免 rawfile 已删除的旧器件（如 R_10k ±60）残留被扫描加载
      if (DeviceLibraryBootstrap.dirExists(targetRoot)) {
        DeviceLibraryBootstrap.removeDirRecursive(targetRoot);
      }
      fs.mkdirSync(targetRoot, true);
      const rm = context.resourceManager as ResourceManagerLike;
      await DeviceLibraryBootstrap.copyRawDir(rm, 'DeviceLibrary', targetRoot);
      const markerFile = fs.openSync(marker, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(markerFile.fd, DEVICE_LIBRARY_BOOTSTRAP_VERSION);
      fs.closeSync(markerFile);
      Logger.info('component_library',
        `DeviceLibrary 已引导至 ${targetRoot} (v=${DEVICE_LIBRARY_BOOTSTRAP_VERSION})`);
      return true;
    } catch (e) {
      Logger.info('component_library', `DeviceLibrary 引导失败: ${e}`);
    }
    return false;
  }

  private static async copyRawDir(rm: object, rawDir: string, targetDir: string): Promise<void> {
    const resourceMgr = rm as ResourceManagerLike;
    const names = await resourceMgr.getRawFileList(rawDir);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const rawPath = `${rawDir}/${name}`;
      const outPath = `${targetDir}/${name}`;
      try {
        const nested = await resourceMgr.getRawFileList(rawPath);
        if (nested.length > 0) {
          fs.mkdirSync(outPath, true);
          await DeviceLibraryBootstrap.copyRawDir(resourceMgr, rawPath, outPath);
          continue;
        }
      } catch (_e) {
        // not a directory — copy as file
      }
      const data = await resourceMgr.getRawFileContent(rawPath);
      try {
        const file = fs.openSync(outPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
        fs.writeSync(file.fd, data.buffer);
        fs.closeSync(file);
      } catch (_e) {
        Logger.info('component_library', `copy failed: ${outPath}`);
      }
    }
  }

  private static dirExists(path: string): boolean {
    try {
      const stat = fs.statSync(path);
      return stat.isDirectory();
    } catch (_e) {
      return false;
    }
  }

  private static fileExists(path: string): boolean {
    try {
      fs.accessSync(path);
      return true;
    } catch (_e) {
      return false;
    }
  }

  private static readText(path: string): string {
    try {
      const file = fs.openSync(path, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(path);
      const buf = new ArrayBuffer(stat.size);
      fs.readSync(file.fd, buf);
      fs.closeSync(file);
      const bytes = new Uint8Array(buf);
      let text = '';
      for (let i = 0; i < bytes.length; i++) {
        text += String.fromCharCode(bytes[i]);
      }
      return text.trim();
    } catch (_e) {
      return '';
    }
  }

  private static removeDirRecursive(dirPath: string): void {
    try {
      const names = fs.listFileSync(dirPath);
      for (let i = 0; i < names.length; i++) {
        const child = `${dirPath}/${names[i]}`;
        try {
          const st = fs.statSync(child);
          if (st.isDirectory()) {
            DeviceLibraryBootstrap.removeDirRecursive(child);
          } else {
            fs.unlinkSync(child);
          }
        } catch (_e) {
          try {
            fs.unlinkSync(child);
          } catch (__e) { /* ignore */ }
        }
      }
      fs.rmdirSync(dirPath);
    } catch (_e) { /* ignore */ }
  }
}
