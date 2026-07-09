/**
 * 从 rawfile 引导 DeviceLibrary 到应用可写目录
 */
import { common } from '@kit.AbilityKit';
import fs from '@ohos.file.fs';
import { Logger } from 'common';

interface ResourceManagerLike {
  getRawFileList(path: string): Promise<string[]>;
  getRawFileContent(path: string): Promise<Uint8Array>;
}

export class DeviceLibraryBootstrap {
  static async ensureLibrary(context: common.UIAbilityContext, targetRoot: string): Promise<boolean> {
    try {
      const marker = `${targetRoot}/.bootstrapped`;
      if (DeviceLibraryBootstrap.dirExists(targetRoot) && DeviceLibraryBootstrap.fileExists(marker)) {
        return true;
      }
      fs.mkdirSync(targetRoot, true);
      const rm = context.resourceManager as ResourceManagerLike;
      await DeviceLibraryBootstrap.copyRawDir(rm, 'DeviceLibrary', targetRoot);
      const markerFile = fs.openSync(marker, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY);
      fs.writeSync(markerFile.fd, 'ok');
      fs.closeSync(markerFile);
      Logger.info('component_library', `DeviceLibrary 已引导至 ${targetRoot}`);
      return true;
    } catch (e) {
      Logger.info('component_library', `DeviceLibrary 引导失败: ${e}`);
      return false;
    }
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
}
