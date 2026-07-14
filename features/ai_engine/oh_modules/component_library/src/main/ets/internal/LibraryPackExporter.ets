/**
 * 器件库离线包导出/导入 — ZIP 风格目录打包（tar 目录结构）
 */
import fs from '@ohos.file.fs';
import { Result, CryptoUtil } from 'common';

export interface LibraryPackManifest {
  version: string;
  deviceCount: number;
  files: string[];
  packHash: string;
}

export class LibraryPackExporter {
  static exportPack(sourceDir: string, outDir: string): Result<string> {
    try {
      const packDir = `${outDir}/library_pack`;
      fs.mkdirSync(packDir);
      const files: string[] = [];
      LibraryPackExporter.copyRecursive(sourceDir, packDir, files);
      const manifest: LibraryPackManifest = {
        version: '1.0.0',
        deviceCount: files.filter(f => f.endsWith('.meta.json')).length,
        files: files,
        packHash: CryptoUtil.sha256(files.join('|')).substring(0, 16)
      };
      const manifestPath = `${packDir}/pack_manifest.json`;
      const fh = fs.openSync(manifestPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(fh.fd, JSON.stringify(manifest, null, 2));
      fs.closeSync(fh);
      return { success: true, data: packDir };
    } catch (e) {
      return { success: false, error: `${e}` };
    }
  }

  static importPack(packDir: string, targetDir: string): Result<number> {
    try {
      const manifestPath = `${packDir}/pack_manifest.json`;
      const text = LibraryPackExporter.readText(manifestPath);
      const manifest = JSON.parse(text) as LibraryPackManifest;
      let count = 0;
      for (let i = 0; i < manifest.files.length; i++) {
        const rel = manifest.files[i];
        const src = `${packDir}/${rel}`;
        const dst = `${targetDir}/${rel}`;
        try {
          fs.accessSync(src);
          LibraryPackExporter.ensureParent(dst);
          LibraryPackExporter.copyFile(src, dst);
          count++;
        } catch (_e) { /* skip */ }
      }
      return { success: true, data: count };
    } catch (e) {
      return { success: false, error: `${e}` };
    }
  }

  private static copyRecursive(src: string, dst: string, files: string[]): void {
    try {
      const entries = fs.listFileSync(src);
      for (let i = 0; i < entries.length; i++) {
        const name = entries[i];
        const srcPath = `${src}/${name}`;
        const dstPath = `${dst}/${name}`;
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          try { fs.mkdirSync(dstPath); } catch (_e) { /* exists */ }
          LibraryPackExporter.copyRecursive(srcPath, dstPath, files);
        } else {
          LibraryPackExporter.copyFile(srcPath, dstPath);
          files.push(name);
        }
      }
    } catch (e) {
      throw new Error(String(e));
    }
  }

  private static copyFile(src: string, dst: string): void {
    try {
      const inFh = fs.openSync(src, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(src);
      const buf = new ArrayBuffer(stat.size);
      fs.readSync(inFh.fd, buf);
      fs.closeSync(inFh);
      LibraryPackExporter.ensureParent(dst);
      const outFh = fs.openSync(dst, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(outFh.fd, buf);
      fs.closeSync(outFh);
    } catch (e) {
      throw new Error(String(e));
    }
  }

  private static ensureParent(path: string): void {
    const idx = path.lastIndexOf('/');
    if (idx > 0) {
      try { fs.mkdirSync(path.substring(0, idx)); } catch (_e) { /* exists */ }
    }
  }

  private static readText(path: string): string {
    try {
      const fh = fs.openSync(path, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(path);
      const buf = new ArrayBuffer(stat.size);
      fs.readSync(fh.fd, buf);
      fs.closeSync(fh);
      let text = '';
      const view = new Uint8Array(buf);
      for (let i = 0; i < view.length; i++) text += String.fromCharCode(view[i]);
      return text;
    } catch (e) {
      throw new Error(String(e));
    }
  }
}
