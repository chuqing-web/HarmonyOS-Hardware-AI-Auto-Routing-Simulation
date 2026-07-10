/**
 * 引导 Test_Template / project / hex_files，从 rawfile 复制模板工程
 */
import { common } from '@kit.AbilityKit';
import fs from '@ohos.file.fs';
import { Logger } from 'common';
import { ProjectPaths } from './ProjectPaths';

interface ResourceManagerLike {
  getRawFileList(path: string): Promise<string[]>;
  getRawFileContent(path: string): Promise<Uint8Array>;
}

export class TemplateProjectBootstrap {

  static async ensure(context: common.UIAbilityContext, baseDir: string): Promise<void> {
    TemplateProjectBootstrap.mkdirSafe(baseDir);
    TemplateProjectBootstrap.mkdirSafe(`${baseDir}/${ProjectPaths.AUTOSAVE_DIR}`);
    TemplateProjectBootstrap.mkdirSafe(ProjectPaths.userProjectRoot(baseDir));
    TemplateProjectBootstrap.mkdirSafe(ProjectPaths.templateRoot(baseDir));
    TemplateProjectBootstrap.mkdirSafe(ProjectPaths.hexRoot(baseDir));

    const rm = context.resourceManager as ResourceManagerLike;
    await TemplateProjectBootstrap.copyRawDirIfExists(rm, ProjectPaths.HEX_DIR,
      ProjectPaths.hexRoot(baseDir));
    await TemplateProjectBootstrap.copyRawDirIfExists(rm, ProjectPaths.TEMPLATE_DIR,
      ProjectPaths.templateRoot(baseDir));

    const tplCount = TemplateProjectBootstrap.listTemplateSchsimFiles(baseDir).length;
    const hexCount = TemplateProjectBootstrap.listHexFiles(baseDir).length;
    Logger.info('AISchSim',
      `工程目录已就绪 @ ${baseDir} | project | Test_Template(${tplCount}) | hex_files(${hexCount})`);
  }

  private static mkdirSafe(path: string): void {
    try {
      fs.mkdirSync(path, true);
    } catch (_e) { /* exists */ }
  }

  private static async copyRawDirIfExists(rm: ResourceManagerLike,
    rawDir: string, targetDir: string): Promise<void> {
    try {
      const names = await rm.getRawFileList(rawDir);
      if (names.length === 0) {
        return;
      }
      TemplateProjectBootstrap.mkdirSafe(targetDir);
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const rawPath = `${rawDir}/${name}`;
        const outPath = `${targetDir}/${name}`;
        try {
          const nested = await rm.getRawFileList(rawPath);
          if (nested.length > 0) {
            fs.mkdirSync(outPath, true);
            await TemplateProjectBootstrap.copyRawDirIfExists(rm, rawPath, outPath);
            continue;
          }
        } catch (_e) { /* file */ }
        try {
          const data = await rm.getRawFileContent(rawPath);
          const file = fs.openSync(outPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
          fs.writeSync(file.fd, data.buffer);
          fs.closeSync(file);
        } catch (_e) {
          Logger.info('AISchSim', `copy skip: ${outPath}`);
        }
      }
    } catch (_e) {
      // rawfile 子目录不存在时跳过
    }
  }

  static fileExists(path: string): boolean {
    try {
      fs.accessSync(path);
      return true;
    } catch (_e) {
      return false;
    }
  }

  static listTemplateSchsimFiles(baseDir: string): string[] {
    const dir = ProjectPaths.templateRoot(baseDir);
    try {
      const names = fs.listFileSync(dir);
      const out: string[] = [];
      for (let i = 0; i < names.length; i++) {
        if (names[i].endsWith('.schsim')) {
          out.push(`${dir}/${names[i]}`);
        }
      }
      return out.sort();
    } catch (_e) {
      return [];
    }
  }

  static listHexFiles(baseDir: string): string[] {
    const dir = ProjectPaths.hexRoot(baseDir);
    try {
      const names = fs.listFileSync(dir);
      const out: string[] = [];
      for (let i = 0; i < names.length; i++) {
        const lower = names[i].toLowerCase();
        if (lower.endsWith('.hex') || lower.endsWith('.bin')) {
          out.push(`${dir}/${names[i]}`);
        }
      }
      return out.sort();
    } catch (_e) {
      return [];
    }
  }
}
