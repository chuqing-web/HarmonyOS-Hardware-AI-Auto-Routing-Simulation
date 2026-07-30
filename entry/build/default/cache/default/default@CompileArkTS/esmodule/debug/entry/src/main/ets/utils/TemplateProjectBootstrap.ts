import type common from "@ohos:app.ability.common";
import fs from "@ohos:file.fs";
import { Logger, traceBurn } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProjectPaths } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/ProjectPaths";
interface ResourceManagerLike {
    getRawFileList(path: string): Promise<string[]>;
    getRawFileContent(path: string): Promise<Uint8Array>;
}
/** rawfile 列表失败时按名直拷（与 rawfile/hex_files 对齐） */
const HEX_FALLBACK_FILES: string[] = [
    'lab_51_led.hex',
    'lab_uart.hex',
    'lab_memory.hex',
    'lab_mcu_8051.hex',
    'lab_mcu_stm32.hex',
    'lab_peripheral.hex',
    'lab_sensor.hex'
];
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
        await TemplateProjectBootstrap.copyHexFiles(rm, ProjectPaths.hexRoot(baseDir));
        await TemplateProjectBootstrap.copyRawDirIfExists(rm, ProjectPaths.TEMPLATE_DIR, ProjectPaths.templateRoot(baseDir));
        const tplCount = TemplateProjectBootstrap.listTemplateSchsimFiles(baseDir).length;
        const pcbCount = TemplateProjectBootstrap.listTemplatePcbsimFiles(baseDir).length;
        const hexFiles = TemplateProjectBootstrap.listHexFiles(baseDir);
        const hexCount = hexFiles.length;
        Logger.info('AISchSim', `工程目录已就绪 @ ${baseDir} | project | Test_Template(sch=${tplCount},pcb=${pcbCount}) | hex_files(${hexCount})`);
        const preview = hexFiles.slice(0, 12).join(', ');
        const more = hexCount > 12 ? ` ...+${hexCount - 12}` : '';
        traceBurn('HEX_SANDBOX', `dir=${ProjectPaths.hexRoot(baseDir)} count=${hexCount} files=[${preview}${more}]`);
        if (hexCount === 0) {
            Logger.warn('AISchSim', `hex_files 为空：请确认 HAP 含 rawfile/${ProjectPaths.HEX_DIR}，并重新安装应用`);
        }
    }
    private static mkdirSafe(path: string): void {
        try {
            fs.mkdirSync(path, true);
        }
        catch (_e) { /* exists */ }
    }
    /** 将 Uint8Array 完整写入（拷贝为独立 ArrayBuffer，避免结构类型赋值） */
    private static writeBytesAtomic(outPath: string, data: Uint8Array): void {
        const tmpPath = `${outPath}.tmp`;
        const payload: ArrayBuffer = new ArrayBuffer(data.byteLength);
        const view = new Uint8Array(payload);
        for (let i = 0; i < data.byteLength; i++) {
            view[i] = data[i];
        }
        try {
            const file = fs.openSync(tmpPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            try {
                fs.writeSync(file.fd, payload);
            }
            finally {
                fs.closeSync(file);
            }
            try {
                fs.accessSync(outPath);
                fs.unlinkSync(outPath);
            }
            catch (_exist) { /* new file */ }
            fs.renameSync(tmpPath, outPath);
        }
        catch (e) {
            try {
                fs.unlinkSync(tmpPath);
            }
            catch (_cleanup) { /* ignore */ }
            throw new Error(`writeBytesAtomic failed: ${outPath}: ${e}`);
        }
    }
    private static async copyOneRawFile(rm: ResourceManagerLike, rawPath: string, outPath: string): Promise<boolean> {
        try {
            const data = await rm.getRawFileContent(rawPath);
            TemplateProjectBootstrap.writeBytesAtomic(outPath, data);
            return true;
        }
        catch (e) {
            try {
                fs.unlinkSync(`${outPath}.tmp`);
            }
            catch (_cleanup) { /* ignore */ }
            Logger.info('AISchSim', `copy skip: ${rawPath} → ${outPath} (${e})`);
            return false;
        }
    }
    /**
     * hex_files：先按目录列表拷贝；若仍为空则按内置文件名逐个 getRawFileContent（兼容列表 API 异常）。
     */
    private static async copyHexFiles(rm: ResourceManagerLike, targetDir: string): Promise<void> {
        TemplateProjectBootstrap.mkdirSafe(targetDir);
        let copied = 0;
        try {
            const names = await rm.getRawFileList(ProjectPaths.HEX_DIR);
            Logger.info('AISchSim', `rawfile/${ProjectPaths.HEX_DIR} list=${names.length}`);
            for (let i = 0; i < names.length; i++) {
                const name = names[i];
                const rawPath = `${ProjectPaths.HEX_DIR}/${name}`;
                const outPath = `${targetDir}/${name}`;
                // 跳过嵌套目录名；hex 目录应为扁平 .hex
                try {
                    const nested = await rm.getRawFileList(rawPath);
                    if (nested.length > 0) {
                        continue;
                    }
                }
                catch (_e) { /* file */ }
                if (await TemplateProjectBootstrap.copyOneRawFile(rm, rawPath, outPath)) {
                    copied++;
                }
            }
        }
        catch (e) {
            Logger.warn('AISchSim', `getRawFileList(${ProjectPaths.HEX_DIR}) failed: ${e}`);
        }
        if (copied === 0) {
            Logger.info('AISchSim', `hex_files 目录列表为空或拷贝失败，尝试按名直拷 ${HEX_FALLBACK_FILES.length} 个`);
            for (let i = 0; i < HEX_FALLBACK_FILES.length; i++) {
                const name = HEX_FALLBACK_FILES[i];
                const ok = await TemplateProjectBootstrap.copyOneRawFile(rm, `${ProjectPaths.HEX_DIR}/${name}`, `${targetDir}/${name}`);
                if (ok) {
                    copied++;
                }
            }
        }
        Logger.info('AISchSim', `hex_files 已拷贝 ${copied} 个 → ${targetDir}`);
    }
    private static async copyRawDirIfExists(rm: ResourceManagerLike, rawDir: string, targetDir: string): Promise<void> {
        try {
            const names = await rm.getRawFileList(rawDir);
            if (names.length === 0) {
                Logger.info('AISchSim', `rawfile/${rawDir} 列表为空`);
                return;
            }
            TemplateProjectBootstrap.mkdirSafe(targetDir);
            let copied = 0;
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
                }
                catch (_e) { /* file */ }
                if (await TemplateProjectBootstrap.copyOneRawFile(rm, rawPath, outPath)) {
                    copied++;
                }
            }
            Logger.info('AISchSim', `rawfile/${rawDir} 已拷贝 ${copied}/${names.length} → ${targetDir}`);
        }
        catch (e) {
            Logger.warn('AISchSim', `rawfile/${rawDir} 复制跳过: ${e}`);
        }
    }
    static fileExists(path: string): boolean {
        try {
            fs.accessSync(path);
            return true;
        }
        catch (_e) {
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
        }
        catch (_e) {
            return [];
        }
    }
    static listTemplatePcbsimFiles(baseDir: string): string[] {
        const dir = ProjectPaths.templateRoot(baseDir);
        try {
            const names = fs.listFileSync(dir);
            const out: string[] = [];
            for (let i = 0; i < names.length; i++) {
                if (names[i].endsWith(ProjectPaths.PCB_EXT)) {
                    out.push(`${dir}/${names[i]}`);
                }
            }
            return out.sort();
        }
        catch (_e) {
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
        }
        catch (_e) {
            return [];
        }
    }
}
