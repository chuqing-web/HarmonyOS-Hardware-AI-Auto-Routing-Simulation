import fs from "@ohos:file.fs";
import { ResultHelper, ErrCode, Logger, makeProgress } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ApiResult, ProgressCallback } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { PluginManifestParser } from "@bundle:com.elecdraw.aischsim/entry@plugin_system/ets/PluginManifestParser";
import type { PluginInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface PluginCatalogEntry {
    id: string;
    name: string;
    version: string;
    description: string;
    downloadUrl: string;
    sha256: string;
    signed: boolean;
}
interface BuiltinManifest {
    name: string;
    version: string;
    entry: string;
    apis: string[];
    permissions: string[];
}
const DEFAULT_CATALOG: PluginCatalogEntry[] = [
    {
        id: 'batch_bom_export',
        name: 'BOM 批量导出',
        version: '1.0.0',
        description: '导出合并 BOM CSV',
        downloadUrl: 'builtin://batch_bom_export.json',
        sha256: '',
        signed: true
    },
    {
        id: 'spice_auto_optimize',
        name: 'SPICE 自动优化',
        version: '1.0.0',
        description: '网表参数扫描建议',
        downloadUrl: 'builtin://spice_auto_optimize.json',
        sha256: '',
        signed: true
    }
];
export class PluginStoreClient {
    private catalog: PluginCatalogEntry[] = DEFAULT_CATALOG.slice();
    private installDir: string = '';
    setInstallDir(dir: string): void {
        this.installDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    }
    fetchCatalog(remoteUrl?: string): ApiResult<PluginCatalogEntry[]> {
        if (remoteUrl && remoteUrl.startsWith('http')) {
            Logger.info('plugin_store', `catalog fetch deferred: ${remoteUrl}`);
        }
        return ResultHelper.ok(this.catalog.slice());
    }
    install(entryId: string, onProgress?: ProgressCallback): ApiResult<PluginInfo> {
        const entry = this.catalog.find(e => e.id === entryId);
        if (!entry)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'plugin not in catalog');
        onProgress?.(makeProgress(10, `Installing ${entry.name}`));
        try {
            fs.mkdirSync(this.installDir);
        }
        catch (_e) { /* exists */ }
        const targetPath = `${this.installDir}/${entry.id}.json`;
        if (entry.downloadUrl.startsWith('builtin://')) {
            const builtin = PluginStoreClient.builtinManifest(entry);
            try {
                const fh = fs.openSync(targetPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                fs.writeSync(fh.fd, JSON.stringify(builtin, null, 2));
                fs.closeSync(fh);
            }
            catch (_e) { /* write failed */ }
        }
        onProgress?.(makeProgress(100, 'Installed', true));
        const info = PluginManifestParser.parse(PluginStoreClient.readText(targetPath), targetPath);
        return ResultHelper.ok(info);
    }
    private static builtinManifest(entry: PluginCatalogEntry): BuiltinManifest {
        const manifest: BuiltinManifest = {
            name: entry.name,
            version: entry.version,
            entry: `${entry.id}.js`,
            apis: ['readTopology', 'exportBom'],
            permissions: ['READ_SCHEMATIC']
        };
        return manifest;
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
            for (let i = 0; i < view.length; i++)
                text += String.fromCharCode(view[i]);
            return text;
        }
        catch (e) {
            throw new Error(`Failed to read file: ${path}`);
        }
    }
}
