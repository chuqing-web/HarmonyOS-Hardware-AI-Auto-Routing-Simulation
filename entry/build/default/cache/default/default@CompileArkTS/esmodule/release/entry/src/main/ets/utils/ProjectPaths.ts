export class ProjectPaths {
    static readonly APP_ROOT = 'AISchSim';
    static readonly USER_PROJECT_DIR = 'project';
    static readonly TEMPLATE_DIR = 'Test_Template';
    static readonly HEX_DIR = 'hex_files';
    static readonly AUTOSAVE_DIR = 'autosave';
    static userProjectRoot(x240: string): string {
        return `${x240}/${ProjectPaths.USER_PROJECT_DIR}`;
    }
    static templateRoot(w240: string): string {
        return `${w240}/${ProjectPaths.TEMPLATE_DIR}`;
    }
    static hexRoot(v240: string): string {
        return `${v240}/${ProjectPaths.HEX_DIR}`;
    }
    static templateFile(t240: string, u240: string): string {
        return `${ProjectPaths.templateRoot(t240)}/${u240}.schsim`;
    }
    static hexFile(r240: string, s240: string): string {
        return `${ProjectPaths.hexRoot(r240)}/${s240}`;
    }
    static defaultUserProject(p240: string, q240: string): string {
        return `${ProjectPaths.userProjectRoot(p240)}/${q240}.schsim`;
    }
    static autosaveRoot(o240: string): string {
        return `${o240}/${ProjectPaths.AUTOSAVE_DIR}`;
    }
    static autosaveFile(m240: string, n240: string): string {
        return `${ProjectPaths.autosaveRoot(m240)}/${n240}.schsim`;
    }
    static appRootFromFilesDir(l240: string): string {
        return `${l240}/${ProjectPaths.APP_ROOT}`;
    }
}
