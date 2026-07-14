import type { IPluginManager } from './api/IPluginManager';
import { PluginManifestParser } from "@bundle:com.elecdraw.aischsim/entry@plugin_system/ets/PluginManifestParser";
import { PluginPermission, PluginType, ResultHelper, ErrCode, Logger, makeProgress, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PluginInfo, SchTopology, WaveData, ApiResult, ProgressCallback } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { PluginSandbox } from "@bundle:com.elecdraw.aischsim/entry@plugin_system/ets/sandbox/PluginSandbox";
import { PluginStoreClient } from "@bundle:com.elecdraw.aischsim/entry@plugin_system/ets/store/PluginStoreClient";
import type { PluginCatalogEntry } from "@bundle:com.elecdraw.aischsim/entry@plugin_system/ets/store/PluginStoreClient";
import fs from "@ohos:file.fs";
const BUILTIN_PLUGINS: string[] = ['batch_bom_export', 'spice_auto_optimize', 'device_wizard', 'ai_task_ext'];
export class PluginManagerImpl implements IPluginManager {
    private plugins: Map<string, PluginInfo> = new Map();
    private grantedPerms: Map<string, Set<PluginPermission>> = new Map();
    private topologyCache: SchTopology | null = null;
    private waveCache: WaveData[] = [];
    private storeClient: PluginStoreClient = new PluginStoreClient();
    loadPlugin(manifestPath: string): ApiResult<PluginInfo> {
        try {
            let info: PluginInfo;
            if (manifestPath.endsWith('.json')) {
                const jsonText = PluginManagerImpl.readTextFile(manifestPath);
                info = PluginManifestParser.parse(jsonText, manifestPath);
            }
            else {
                info = {
                    id: IdUtil.generate('plugin'),
                    name: manifestPath.split('/').pop() ?? 'Unknown',
                    version: '1.0.0',
                    type: PluginType.SCRIPT,
                    path: manifestPath,
                    signed: manifestPath.includes('.signed'),
                    enabled: true,
                    permissions: [PluginPermission.READ_SCHEMATIC]
                };
            }
            if (!info.signed) {
                Logger.warn('plugin_system', `未签名插件 ${info.name} 仅允许离线脚本模式`);
                const filtered: PluginPermission[] = [];
                for (let i = 0; i < info.permissions.length; i++) {
                    const perm = info.permissions[i];
                    if (perm !== PluginPermission.NETWORK && perm !== PluginPermission.READ_KEYS) {
                        filtered.push(perm);
                    }
                }
                info.permissions = filtered;
            }
            this.plugins.set(info.id, info);
            return ResultHelper.ok(info);
        }
        catch (e) {
            return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `${e}`);
        }
    }
    unloadPlugin(pluginId: string): ApiResult<void> {
        if (!this.plugins.delete(pluginId))
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        this.grantedPerms.delete(pluginId);
        return ResultHelper.ok();
    }
    listPlugins(): PluginInfo[] {
        const result: PluginInfo[] = [];
        this.plugins.forEach((info: PluginInfo) => {
            result.push(info);
        });
        return result;
    }
    enablePlugin(pluginId: string): ApiResult<void> {
        const p = this.plugins.get(pluginId);
        if (!p)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        p.enabled = true;
        return ResultHelper.ok();
    }
    disablePlugin(pluginId: string): ApiResult<void> {
        const p = this.plugins.get(pluginId);
        if (!p)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        p.enabled = false;
        return ResultHelper.ok();
    }
    verifySignature(pluginId: string): ApiResult<boolean> {
        const p = this.plugins.get(pluginId);
        if (!p)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        return ResultHelper.ok(p.signed);
    }
    requestPermissions(pluginId: string, perms: PluginPermission[]): ApiResult<boolean> {
        const p = this.plugins.get(pluginId);
        if (!p)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        if (perms.includes(PluginPermission.READ_KEYS)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, '插件禁止访问密钥文件');
        }
        this.grantedPerms.set(pluginId, new Set(perms));
        return ResultHelper.ok(true);
    }
    hotReload(pluginId: string): ApiResult<void> {
        const p = this.plugins.get(pluginId);
        if (!p)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        if (p.path.endsWith('.json')) {
            const reload = this.loadPlugin(p.path);
            if (!reload.success)
                return ResultHelper.fail(reload.errCode ?? ErrCode.ERR_FILE_CORRUPT, reload.error);
        }
        Logger.info('plugin_system', `热重载插件: ${p.name}`);
        return ResultHelper.ok();
    }
    executeScript(pluginId: string, scriptName: string, _args?: Map<string, string>): ApiResult<string> {
        const p = this.plugins.get(pluginId);
        if (!p || !p.enabled)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        if (!p.signed && scriptName.includes('network')) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, '未签名插件禁止网络脚本');
        }
        const granted = this.grantedPerms.get(pluginId) ?? new Set(p.permissions);
        const scriptBody = scriptName.includes('exportBom') ? 'exportBom' :
            (scriptName.includes('readTopology') ? 'readTopology' : scriptName);
        const sandbox = PluginSandbox.execute(scriptBody, granted, this.topologyCache, this.waveCache);
        if (!sandbox.success)
            return ResultHelper.fail(sandbox.errCode ?? ErrCode.ERR_PERMISSION, sandbox.error);
        return ResultHelper.ok(sandbox.data?.output ?? '');
    }
    fetchStoreCatalog(remoteUrl?: string): ApiResult<PluginCatalogEntry[]> {
        return this.storeClient.fetchCatalog(remoteUrl);
    }
    installFromStore(entryId: string, onProgress?: ProgressCallback): ApiResult<PluginInfo> {
        const installed = this.storeClient.install(entryId, onProgress);
        if (!installed.success || !installed.data) {
            return ResultHelper.fail(installed.errCode ?? ErrCode.ERR_FILE_CORRUPT, installed.error);
        }
        this.plugins.set(installed.data.id, installed.data);
        return installed;
    }
    setPluginInstallDir(dir: string): void {
        this.storeClient.setInstallDir(dir);
    }
    readTopology(pluginId: string): ApiResult<SchTopology | null> {
        if (!this.hasPerm(pluginId, PluginPermission.READ_SCHEMATIC)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION);
        }
        return ResultHelper.ok(this.topologyCache);
    }
    writeTopology(pluginId: string, topo: SchTopology): ApiResult<void> {
        if (!this.hasPerm(pluginId, PluginPermission.WRITE_SCHEMATIC)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION);
        }
        this.topologyCache = topo;
        return ResultHelper.ok();
    }
    readWaveData(pluginId: string): ApiResult<WaveData[]> {
        if (!this.hasPerm(pluginId, PluginPermission.READ_SIM_DATA)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION);
        }
        return ResultHelper.ok(this.waveCache);
    }
    importPluginsDir(dirPath: string, onProgress?: ProgressCallback): ApiResult<number> {
        onProgress?.(makeProgress(0, 'Scanning plugins directory'));
        let count = 0;
        try {
            fs.accessSync(dirPath);
            const entries = fs.listFileSync(dirPath);
            for (let i = 0; i < entries.length; i++) {
                const name = entries[i];
                if (name.endsWith('.json')) {
                    this.loadPlugin(`${dirPath}/${name}`);
                    count++;
                    onProgress?.(makeProgress(Math.floor((i + 1) / entries.length * 80), `Loaded ${name}`));
                }
            }
        }
        catch (_e) {
            /* fall through to builtins */
        }
        for (let i = 0; i < BUILTIN_PLUGINS.length; i++) {
            const name = BUILTIN_PLUGINS[i];
            const jsonPath = `${dirPath}/${name}.json`;
            try {
                fs.accessSync(jsonPath);
                this.loadPlugin(jsonPath);
            }
            catch (_e) {
                this.loadPlugin(`${dirPath}/${name}.py`);
            }
            count++;
            onProgress?.(makeProgress(80 + Math.floor((i + 1) / BUILTIN_PLUGINS.length * 20), `Loaded ${name}`));
        }
        onProgress?.(makeProgress(100, 'Import complete', true));
        return ResultHelper.ok(count);
    }
    setTopologyCache(topo: SchTopology): void { this.topologyCache = topo; }
    setWaveCache(waves: WaveData[]): void { this.waveCache = waves; }
    private hasPerm(pluginId: string, perm: PluginPermission): boolean {
        const granted = this.grantedPerms.get(pluginId);
        if (granted === undefined) {
            return false;
        }
        return granted.has(perm);
    }
    private static readTextFile(path: string): string {
        try {
            const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(path);
            const buffer = new ArrayBuffer(stat.size);
            fs.readSync(fileHandle.fd, buffer);
            fs.closeSync(fileHandle);
            let text = '';
            const view = new Uint8Array(buffer);
            for (let i = 0; i < view.length; i++) {
                text += String.fromCharCode(view[i]);
            }
            return text;
        }
        catch (e) {
            throw new Error(`Failed to read file: ${path}`);
        }
    }
}
