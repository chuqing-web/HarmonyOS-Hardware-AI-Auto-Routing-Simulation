import type common from "@ohos:app.ability.common";
import fs from "@ohos:file.fs";
import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProjectPaths } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/ProjectPaths";
interface ResourceManagerLike {
    getRawFileList(path: string): Promise<string[]>;
    getRawFileContent(path: string): Promise<Uint8Array>;
}
export class TemplateProjectBootstrap {
    static async ensure(f250: common.UIAbilityContext, g250: string): Promise<void> {
        TemplateProjectBootstrap.mkdirSafe(g250);
        TemplateProjectBootstrap.mkdirSafe(`${g250}/${ProjectPaths.AUTOSAVE_DIR}`);
        TemplateProjectBootstrap.mkdirSafe(ProjectPaths.userProjectRoot(g250));
        TemplateProjectBootstrap.mkdirSafe(ProjectPaths.templateRoot(g250));
        TemplateProjectBootstrap.mkdirSafe(ProjectPaths.hexRoot(g250));
        const h250 = f250.resourceManager as ResourceManagerLike;
        await TemplateProjectBootstrap.copyRawDirIfExists(h250, ProjectPaths.HEX_DIR, ProjectPaths.hexRoot(g250));
        await TemplateProjectBootstrap.copyRawDirIfExists(h250, ProjectPaths.TEMPLATE_DIR, ProjectPaths.templateRoot(g250));
        const i250 = TemplateProjectBootstrap.listTemplateSchsimFiles(g250).length;
        const j250 = TemplateProjectBootstrap.listHexFiles(g250).length;
        Logger.info('AISchSim', `工程目录已就绪 @ ${g250} | project | Test_Template(${i250}) | hex_files(${j250})`);
    }
    private static mkdirSafe(d250: string): void {
        try {
            fs.mkdirSync(d250, true);
        }
        catch (e250) { }
    }
    private static async copyRawDirIfExists(p249: ResourceManagerLike, q249: string, r249: string): Promise<void> {
        try {
            const t249 = await p249.getRawFileList(q249);
            if (t249.length === 0) {
                return;
            }
            TemplateProjectBootstrap.mkdirSafe(r249);
            for (let u249 = 0; u249 < t249.length; u249++) {
                const v249 = t249[u249];
                const w249 = `${q249}/${v249}`;
                const x249 = `${r249}/${v249}`;
                try {
                    const c250 = await p249.getRawFileList(w249);
                    if (c250.length > 0) {
                        fs.mkdirSync(x249, true);
                        await TemplateProjectBootstrap.copyRawDirIfExists(p249, w249, x249);
                        continue;
                    }
                }
                catch (b250) { }
                try {
                    const z249 = await p249.getRawFileContent(w249);
                    const a250 = fs.openSync(x249, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                    fs.writeSync(a250.fd, z249.buffer);
                    fs.closeSync(a250);
                }
                catch (y249) {
                    Logger.info('AISchSim', `copy skip: ${x249}`);
                }
            }
        }
        catch (s249) {
        }
    }
    static fileExists(n249: string): boolean {
        try {
            fs.accessSync(n249);
            return true;
        }
        catch (o249) {
            return false;
        }
    }
    static listTemplateSchsimFiles(h249: string): string[] {
        const i249 = ProjectPaths.templateRoot(h249);
        try {
            const k249 = fs.listFileSync(i249);
            const l249: string[] = [];
            for (let m249 = 0; m249 < k249.length; m249++) {
                if (k249[m249].endsWith('.schsim')) {
                    l249.push(`${i249}/${k249[m249]}`);
                }
            }
            return l249.sort();
        }
        catch (j249) {
            return [];
        }
    }
    static listHexFiles(a249: string): string[] {
        const b249 = ProjectPaths.hexRoot(a249);
        try {
            const d249 = fs.listFileSync(b249);
            const e249: string[] = [];
            for (let f249 = 0; f249 < d249.length; f249++) {
                const g249 = d249[f249].toLowerCase();
                if (g249.endsWith('.hex') || g249.endsWith('.bin')) {
                    e249.push(`${b249}/${d249[f249]}`);
                }
            }
            return e249.sort();
        }
        catch (c249) {
            return [];
        }
    }
}
