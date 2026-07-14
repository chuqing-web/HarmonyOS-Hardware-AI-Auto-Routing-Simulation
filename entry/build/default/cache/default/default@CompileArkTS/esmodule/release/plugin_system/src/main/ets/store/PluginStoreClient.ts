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
    setInstallDir(p402: string): void {
        this.installDir = p402.endsWith('/') ? p402.slice(0, -1) : p402;
    }
    fetchCatalog(o402?: string): ApiResult<PluginCatalogEntry[]> {
        if (o402 && o402.startsWith('http')) {
            Logger.info('plugin_store', `catalog fetch deferred: ${o402}`);
        }
        return ResultHelper.ok(this.catalog.slice());
    }
    install(e402: string, f402?: ProgressCallback): ApiResult<PluginInfo> {
        const g402 = this.catalog.find(n402 => n402.id === e402);
        if (!g402)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'plugin not in catalog');
        f402?.(makeProgress(10, `Installing ${g402.name}`));
        try {
            fs.mkdirSync(this.installDir);
        }
        catch (m402) { }
        const h402 = `${this.installDir}/${g402.id}.json`;
        if (g402.downloadUrl.startsWith('builtin://')) {
            const j402 = PluginStoreClient.builtinManifest(g402);
            try {
                const l402 = fs.openSync(h402, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                fs.writeSync(l402.fd, JSON.stringify(j402, null, 2));
                fs.closeSync(l402);
            }
            catch (k402) { }
        }
        f402?.(makeProgress(100, 'Installed', true));
        const i402 = PluginManifestParser.parse(PluginStoreClient.readText(h402), h402);
        return ResultHelper.ok(i402);
    }
    private static builtinManifest(c402: PluginCatalogEntry): BuiltinManifest {
        const d402: BuiltinManifest = {
            name: c402.name,
            version: c402.version,
            entry: `${c402.id}.js`,
            apis: ['readTopology', 'exportBom'],
            permissions: ['READ_SCHEMATIC']
        };
        return d402;
    }
    private static readText(u401: string): string {
        try {
            const w401 = fs.openSync(u401, fs.OpenMode.READ_ONLY);
            const x401 = fs.statSync(u401);
            const y401 = new ArrayBuffer(x401.size);
            fs.readSync(w401.fd, y401);
            fs.closeSync(w401);
            let z401 = '';
            const a402 = new Uint8Array(y401);
            for (let b402 = 0; b402 < a402.length; b402++)
                z401 += String.fromCharCode(a402[b402]);
            return z401;
        }
        catch (v401) {
            throw new Error(`Failed to read file: ${u401}`);
        }
    }
}
