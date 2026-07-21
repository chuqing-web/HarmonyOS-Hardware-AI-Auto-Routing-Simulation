import fs from "@ohos:file.fs";
import { CryptoUtil, Logger, INSTR_TRACE_TAG } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
interface VaultFileEnvelope {
    version: number;
    /** CryptoUtil 加密后的 JSON(AiApiConfig[]) */
    cipher: string;
    updatedAt: string;
}
export class AiApiVaultStore {
    private static instance: AiApiVaultStore;
    private vaultDir: string = '';
    private vaultPath: string = '';
    static getInstance(): AiApiVaultStore {
        if (!AiApiVaultStore.instance) {
            AiApiVaultStore.instance = new AiApiVaultStore();
        }
        return AiApiVaultStore.instance;
    }
    /** baseDir = filesDir/AISchSim */
    init(baseDir: string): void {
        this.vaultDir = `${baseDir}/api_vault`;
        this.vaultPath = `${this.vaultDir}/apis.enc`;
        try {
            fs.accessSync(this.vaultDir);
        }
        catch (_e) {
            try {
                fs.mkdirSync(this.vaultDir, true);
            }
            catch (_e2) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] vault mkdir failed: ${this.vaultDir}`);
            }
        }
    }
    getVaultDir(): string {
        return this.vaultDir;
    }
    getVaultPath(): string {
        return this.vaultPath;
    }
    /** 解密读取；失败或空返回 []（corrupt 会尝试 .bak） */
    loadConfigs(): AiApiConfig[] {
        if (this.vaultPath.length === 0) {
            return [];
        }
        const primary = this.loadConfigsFromPath(this.vaultPath);
        if (primary !== null) {
            return primary;
        }
        const bakPath = `${this.vaultPath}.bak`;
        const bak = this.loadConfigsFromPath(bakPath);
        if (bak !== null) {
            Logger.warn(INSTR_TRACE_TAG, `[AI_API] vault primary corrupt — restored from .bak count=${bak.length}`);
            return bak;
        }
        Logger.info(INSTR_TRACE_TAG, '[AI_API] vault empty (no file or unreadable)');
        return [];
    }
    private loadConfigsFromPath(path: string): AiApiConfig[] | null {
        try {
            fs.accessSync(path);
        }
        catch (_e) {
            return null;
        }
        try {
            const file = fs.openSync(path, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(path);
            const buf = new ArrayBuffer(stat.size);
            fs.readSync(file.fd, buf);
            fs.closeSync(file);
            const view = new Uint8Array(buf);
            let text = '';
            for (let i = 0; i < view.length; i++) {
                text += String.fromCharCode(view[i]);
            }
            const env = JSON.parse(text) as VaultFileEnvelope;
            if (!env || typeof env.cipher !== 'string' || env.cipher.length === 0) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] vault invalid envelope path=${path}`);
                return null;
            }
            const plain = CryptoUtil.decrypt(env.cipher);
            if (plain.length === 0) {
                Logger.warn(INSTR_TRACE_TAG, `[AI_API] vault decrypt empty path=${path}`);
                return null;
            }
            const configs = JSON.parse(plain) as AiApiConfig[];
            if (!Array.isArray(configs)) {
                return null;
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_API] vault load OK count=${configs.length} path=${path}`);
            return configs;
        }
        catch (e) {
            Logger.error(INSTR_TRACE_TAG, `[AI_API] vault load FAILED path=${path}: ${e}`);
            return null;
        }
    }
    /**
     * 整表加密写入。
     * @param allowEmptyWipe true 时允许用户删光 API 后清空金库文件
     */
    saveConfigs(configs: AiApiConfig[], allowEmptyWipe: boolean = false): boolean {
        if (this.vaultPath.length === 0) {
            Logger.warn(INSTR_TRACE_TAG, '[AI_API] vault save skipped: not inited');
            return false;
        }
        if (configs.length === 0) {
            if (!allowEmptyWipe) {
                try {
                    fs.accessSync(this.vaultPath);
                    Logger.warn(INSTR_TRACE_TAG, '[AI_API] vault REFUSED empty wipe');
                    return false;
                }
                catch (_e) {
                    return true;
                }
            }
            try {
                fs.accessSync(this.vaultPath);
                fs.unlinkSync(this.vaultPath);
                Logger.info(INSTR_TRACE_TAG, '[AI_API] vault cleared (user deleted all APIs)');
            }
            catch (_e) {
                /* no file */
            }
            return true;
        }
        try {
            try {
                fs.accessSync(this.vaultDir);
            }
            catch (_e) {
                fs.mkdirSync(this.vaultDir, true);
            }
            const plain = JSON.stringify(configs);
            const cipher = CryptoUtil.encrypt(plain);
            const env: VaultFileEnvelope = {
                version: 1,
                cipher: cipher,
                updatedAt: new Date().toISOString()
            };
            const text = JSON.stringify(env);
            const tmpPath = `${this.vaultPath}.tmp`;
            const bakPath = `${this.vaultPath}.bak`;
            // 原子写：先写 tmp，再备份旧文件，最后 rename 覆盖
            const tmpFile = fs.openSync(tmpPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(tmpFile.fd, text);
            fs.closeSync(tmpFile);
            try {
                fs.accessSync(this.vaultPath);
                try {
                    fs.unlinkSync(bakPath);
                }
                catch (_noBak) {
                    /* ok */
                }
                try {
                    fs.renameSync(this.vaultPath, bakPath);
                }
                catch (_renameBak) {
                    /* 部分平台无 rename：继续直接覆盖 */
                }
            }
            catch (_noOld) {
                /* first save */
            }
            try {
                fs.renameSync(tmpPath, this.vaultPath);
            }
            catch (_renameFinal) {
                // rename 失败则直接写目标（仍优于半截 truncate）
                const file = fs.openSync(this.vaultPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                fs.writeSync(file.fd, text);
                fs.closeSync(file);
                try {
                    fs.unlinkSync(tmpPath);
                }
                catch (_u) {
                    /* ok */
                }
            }
            Logger.info(INSTR_TRACE_TAG, `[AI_API] vault save OK count=${configs.length} path=${this.vaultPath}`);
            return true;
        }
        catch (e) {
            Logger.error(INSTR_TRACE_TAG, `[AI_API] vault save FAILED: ${e}`);
            return false;
        }
    }
}
