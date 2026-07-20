/**
 * 引导 Test_Template / project / hex_files，从 rawfile 复制模板工程
 */
import { common } from '@kit.AbilityKit';
import fs from '@ohos.file.fs';
import { Logger, traceBurn } from 'common';
import { ProjectPaths } from './ProjectPaths';

interface ResourceManagerLike {
  getRawFileList(path: string): Promise<string[]>;
  getRawFileContent(path: string): Promise<Uint8Array>;
}

export class TemplateProjectBootstrap {
  private static readyPromise: Promise<void> | null = null;

  /** 启动时调用一次；重复调用返回同一 Promise */
  static ensure(context: common.UIAbilityContext, baseDir: string): Promise<void> {
    if (TemplateProjectBootstrap.readyPromise === null) {
      TemplateProjectBootstrap.readyPromise =
        TemplateProjectBootstrap.runEnsure(context, baseDir);
    }
    return TemplateProjectBootstrap.readyPromise;
  }

  /** 模板/固件沙箱复制完成后再读盘，避免首次插入撞上未就绪文件 */
  static whenReady(): Promise<void> {
    return TemplateProjectBootstrap.readyPromise ?? Promise.resolve();
  }

  private static async runEnsure(context: common.UIAbilityContext, baseDir: string): Promise<void> {
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
    const hexFiles = TemplateProjectBootstrap.listHexFiles(baseDir);
    const hexCount = hexFiles.length;
    Logger.info('AISchSim',
      `工程目录已就绪 @ ${baseDir} | project | Test_Template(${tplCount}) | hex_files(${hexCount})`);
    const preview = hexFiles.slice(0, 12).join(', ');
    const more = hexCount > 12 ? ` ...+${hexCount - 12}` : '';
    traceBurn('HEX_SANDBOX',
      `dir=${ProjectPaths.hexRoot(baseDir)} count=${hexCount} files=[${preview}${more}]`);
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
          // 始终覆盖：模板 .schsim 会迭代（如加入 netLabelList），旧文件不能永久 skip
          // 先写 .tmp 再 rename，避免 unlink→write 窗口内插入读到缺失/半写文件
          const tmpPath = `${outPath}.tmp`;
          const file = fs.openSync(tmpPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
          fs.writeSync(file.fd, data.buffer);
          fs.closeSync(file);
          try {
            fs.accessSync(outPath);
            fs.unlinkSync(outPath);
          } catch (_exist) { /* new file */ }
          fs.renameSync(tmpPath, outPath);
        } catch (_e) {
          try { fs.unlinkSync(`${outPath}.tmp`); } catch (_cleanup) { /* ignore */ }
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
