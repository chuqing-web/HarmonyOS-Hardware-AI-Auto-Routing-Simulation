/**
 * 应用工程目录常量 — 均位于 context.filesDir/AISchSim/ 下
 * 例: /data/storage/el2/base/haps/entry/files/AISchSim/Test_Template
 */
export class ProjectPaths {
  static readonly APP_ROOT = 'AISchSim';
  /** 用户工程存放目录 */
  static readonly USER_PROJECT_DIR = 'project';
  /** 原理图工程后缀 */
  static readonly SCH_EXT = '.schsim';
  /** PCB 工程后缀（与原理图区分，同目录存放） */
  static readonly PCB_EXT = '.pcbsim';
  /** 实验模板库（每个 .schsim = 一个模板） */
  static readonly TEMPLATE_DIR = 'Test_Template';
  /** 模板关联固件 .hex */
  static readonly HEX_DIR = 'hex_files';
  static readonly AUTOSAVE_DIR = 'autosave';
  /** AI API 加密金库（全局，与工程文件分离） */
  static readonly API_VAULT_DIR = 'api_vault';

  static userProjectRoot(baseDir: string): string {
    return `${baseDir}/${ProjectPaths.USER_PROJECT_DIR}`;
  }

  static apiVaultRoot(baseDir: string): string {
    return `${baseDir}/${ProjectPaths.API_VAULT_DIR}`;
  }

  static apiVaultFile(baseDir: string): string {
    return `${ProjectPaths.apiVaultRoot(baseDir)}/apis.enc`;
  }

  static templateRoot(baseDir: string): string {
    return `${baseDir}/${ProjectPaths.TEMPLATE_DIR}`;
  }

  static hexRoot(baseDir: string): string {
    return `${baseDir}/${ProjectPaths.HEX_DIR}`;
  }

  static templateFile(baseDir: string, templateId: string): string {
    return `${ProjectPaths.templateRoot(baseDir)}/${templateId}.schsim`;
  }

  /** PCB 实验模板路径（与原理图同目录） */
  static templatePcbFile(baseDir: string, templateId: string): string {
    return `${ProjectPaths.templateRoot(baseDir)}/${templateId}${ProjectPaths.PCB_EXT}`;
  }

  static hexFile(baseDir: string, hexName: string): string {
    return `${ProjectPaths.hexRoot(baseDir)}/${hexName}`;
  }

  static defaultUserProject(baseDir: string, name: string): string {
    return `${ProjectPaths.userProjectRoot(baseDir)}/${name}${ProjectPaths.SCH_EXT}`;
  }

  /** 用户 PCB 工程默认路径（与原理图同一 project/ 目录） */
  static defaultUserPcbProject(baseDir: string, name: string): string {
    return `${ProjectPaths.userProjectRoot(baseDir)}/${name}${ProjectPaths.PCB_EXT}`;
  }

  static isSchematicProjectPath(path: string): boolean {
    const lower = path.toLowerCase();
    return lower.endsWith(ProjectPaths.SCH_EXT) || lower.endsWith('.json');
  }

  static isPcbProjectPath(path: string): boolean {
    return path.toLowerCase().endsWith(ProjectPaths.PCB_EXT);
  }

  /**
   * 将任意工程路径/名称规范为沙箱 project/ 下的 .pcbsim。
   * - 已是 .pcbsim → 原样
   * - 用户 project/ 下的 .schsim/.json → 同目录同名 .pcbsim
   * - Test_Template 或 content/file URI → 落到 project/{name}.pcbsim（避免覆盖模板）
   */
  static toUserPcbProjectPath(baseDir: string, pathOrName: string, fallbackName: string = 'Untitled'): string {
    const raw = pathOrName.trim();
    if (raw.length === 0) {
      return ProjectPaths.defaultUserPcbProject(baseDir, fallbackName);
    }
    if (ProjectPaths.isPcbProjectPath(raw)) {
      return raw;
    }

    const leaf = ProjectPaths.fileLeafName(raw);
    let stem = leaf;
    const lowerLeaf = leaf.toLowerCase();
    if (lowerLeaf.endsWith(ProjectPaths.SCH_EXT)) {
      stem = leaf.substring(0, leaf.length - ProjectPaths.SCH_EXT.length);
    } else if (lowerLeaf.endsWith('.json')) {
      stem = leaf.substring(0, leaf.length - '.json'.length);
    } else if (lowerLeaf.endsWith(ProjectPaths.PCB_EXT)) {
      stem = leaf.substring(0, leaf.length - ProjectPaths.PCB_EXT.length);
    }
    stem = stem.replace(/[\\/:*?"<>|]/g, '_');
    if (stem.length === 0) {
      stem = fallbackName;
    }

    // URI / 模板库：一律写入用户 project/
    if (raw.startsWith('content://') || raw.startsWith('file://')
      || raw.indexOf(`/${ProjectPaths.TEMPLATE_DIR}/`) >= 0
      || raw.indexOf(`\\${ProjectPaths.TEMPLATE_DIR}\\`) >= 0) {
      return ProjectPaths.defaultUserPcbProject(baseDir, stem);
    }

    const lower = raw.toLowerCase();
    if (lower.endsWith(ProjectPaths.SCH_EXT)) {
      return raw.substring(0, raw.length - ProjectPaths.SCH_EXT.length) + ProjectPaths.PCB_EXT;
    }
    if (lower.endsWith('.json')) {
      return raw.substring(0, raw.length - '.json'.length) + ProjectPaths.PCB_EXT;
    }
    return ProjectPaths.defaultUserPcbProject(baseDir, stem);
  }

  private static fileLeafName(path: string): string {
    let name = path;
    // file:// 或普通路径均按 / \ 取末段
    const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
    if (slash >= 0) {
      name = name.substring(slash + 1);
    }
    // 去掉 query
    const q = name.indexOf('?');
    if (q >= 0) {
      name = name.substring(0, q);
    }
    return name;
  }

  static autosaveRoot(baseDir: string): string {
    return `${baseDir}/${ProjectPaths.AUTOSAVE_DIR}`;
  }

  static autosaveFile(baseDir: string, projectName: string): string {
    return `${ProjectPaths.autosaveRoot(baseDir)}/${projectName}.schsim`;
  }

  /** context.filesDir + AISchSim，与 initPlatform 中 baseDir 一致 */
  static appRootFromFilesDir(filesDir: string): string {
    return `${filesDir}/${ProjectPaths.APP_ROOT}`;
  }
}
