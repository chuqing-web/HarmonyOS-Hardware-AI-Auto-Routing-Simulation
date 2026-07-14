/**
 * 应用工程目录常量 — 均位于 context.filesDir/AISchSim/ 下
 * 例: /data/storage/el2/base/haps/entry/files/AISchSim/Test_Template
 */
export class ProjectPaths {
    static readonly APP_ROOT = 'AISchSim';
    /** 用户工程存放目录 */
    static readonly USER_PROJECT_DIR = 'project';
    /** 实验模板库（每个 .schsim = 一个模板） */
    static readonly TEMPLATE_DIR = 'Test_Template';
    /** 模板关联固件 .hex */
    static readonly HEX_DIR = 'hex_files';
    static readonly AUTOSAVE_DIR = 'autosave';
    static userProjectRoot(baseDir: string): string {
        return `${baseDir}/${ProjectPaths.USER_PROJECT_DIR}`;
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
    static hexFile(baseDir: string, hexName: string): string {
        return `${ProjectPaths.hexRoot(baseDir)}/${hexName}`;
    }
    static defaultUserProject(baseDir: string, name: string): string {
        return `${ProjectPaths.userProjectRoot(baseDir)}/${name}.schsim`;
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
