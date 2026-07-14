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
    loadPlugin(w400: string): ApiResult<PluginInfo> {
        try {
            let y400: PluginInfo;
            if (w400.endsWith('.json')) {
                const c401 = PluginManagerImpl.readTextFile(w400);
                y400 = PluginManifestParser.parse(c401, w400);
            }
            else {
                y400 = {
                    id: IdUtil.generate('plugin'),
                    name: w400.split('/').pop() ?? 'Unknown',
                    version: '1.0.0',
                    type: PluginType.SCRIPT,
                    path: w400,
                    signed: w400.includes('.signed'),
                    enabled: true,
                    permissions: [PluginPermission.READ_SCHEMATIC]
                };
            }
            if (!y400.signed) {
                Logger.warn('plugin_system', `未签名插件 ${y400.name} 仅允许离线脚本模式`);
                const z400: PluginPermission[] = [];
                for (let a401 = 0; a401 < y400.permissions.length; a401++) {
                    const b401 = y400.permissions[a401];
                    if (b401 !== PluginPermission.NETWORK && b401 !== PluginPermission.READ_KEYS) {
                        z400.push(b401);
                    }
                }
                y400.permissions = z400;
            }
            this.plugins.set(y400.id, y400);
            return ResultHelper.ok(y400);
        }
        catch (x400) {
            return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `${x400}`);
        }
    }
    unloadPlugin(v400: string): ApiResult<void> {
        if (!this.plugins.delete(v400))
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        this.grantedPerms.delete(v400);
        return ResultHelper.ok();
    }
    listPlugins(): PluginInfo[] {
        const t400: PluginInfo[] = [];
        this.plugins.forEach((u400: PluginInfo) => {
            t400.push(u400);
        });
        return t400;
    }
    enablePlugin(r400: string): ApiResult<void> {
        const s400 = this.plugins.get(r400);
        if (!s400)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        s400.enabled = true;
        return ResultHelper.ok();
    }
    disablePlugin(p400: string): ApiResult<void> {
        const q400 = this.plugins.get(p400);
        if (!q400)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        q400.enabled = false;
        return ResultHelper.ok();
    }
    verifySignature(n400: string): ApiResult<boolean> {
        const o400 = this.plugins.get(n400);
        if (!o400)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        return ResultHelper.ok(o400.signed);
    }
    requestPermissions(k400: string, l400: PluginPermission[]): ApiResult<boolean> {
        const m400 = this.plugins.get(k400);
        if (!m400)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        if (l400.includes(PluginPermission.READ_KEYS)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, '插件禁止访问密钥文件');
        }
        this.grantedPerms.set(k400, new Set(l400));
        return ResultHelper.ok(true);
    }
    hotReload(h400: string): ApiResult<void> {
        const i400 = this.plugins.get(h400);
        if (!i400)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        if (i400.path.endsWith('.json')) {
            const j400 = this.loadPlugin(i400.path);
            if (!j400.success)
                return ResultHelper.fail(j400.errCode ?? ErrCode.ERR_FILE_CORRUPT, j400.error);
        }
        Logger.info('plugin_system', `热重载插件: ${i400.name}`);
        return ResultHelper.ok();
    }
    executeScript(a400: string, b400: string, c400?: Map<string, string>): ApiResult<string> {
        const d400 = this.plugins.get(a400);
        if (!d400 || !d400.enabled)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        if (!d400.signed && b400.includes('network')) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, '未签名插件禁止网络脚本');
        }
        const e400 = this.grantedPerms.get(a400) ?? new Set(d400.permissions);
        const f400 = b400.includes('exportBom') ? 'exportBom' :
            (b400.includes('readTopology') ? 'readTopology' : b400);
        const g400 = PluginSandbox.execute(f400, e400, this.topologyCache, this.waveCache);
        if (!g400.success)
            return ResultHelper.fail(g400.errCode ?? ErrCode.ERR_PERMISSION, g400.error);
        return ResultHelper.ok(g400.data?.output ?? '');
    }
    fetchStoreCatalog(z399?: string): ApiResult<PluginCatalogEntry[]> {
        return this.storeClient.fetchCatalog(z399);
    }
    installFromStore(w399: string, x399?: ProgressCallback): ApiResult<PluginInfo> {
        const y399 = this.storeClient.install(w399, x399);
        if (!y399.success || !y399.data) {
            return ResultHelper.fail(y399.errCode ?? ErrCode.ERR_FILE_CORRUPT, y399.error);
        }
        this.plugins.set(y399.data.id, y399.data);
        return y399;
    }
    setPluginInstallDir(v399: string): void {
        this.storeClient.setInstallDir(v399);
    }
    readTopology(u399: string): ApiResult<SchTopology | null> {
        if (!this.hasPerm(u399, PluginPermission.READ_SCHEMATIC)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION);
        }
        return ResultHelper.ok(this.topologyCache);
    }
    writeTopology(s399: string, t399: SchTopology): ApiResult<void> {
        if (!this.hasPerm(s399, PluginPermission.WRITE_SCHEMATIC)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION);
        }
        this.topologyCache = t399;
        return ResultHelper.ok();
    }
    readWaveData(r399: string): ApiResult<WaveData[]> {
        if (!this.hasPerm(r399, PluginPermission.READ_SIM_DATA)) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION);
        }
        return ResultHelper.ok(this.waveCache);
    }
    importPluginsDir(g399: string, h399?: ProgressCallback): ApiResult<number> {
        h399?.(makeProgress(0, 'Scanning plugins directory'));
        let i399 = 0;
        try {
            fs.accessSync(g399);
            const o399 = fs.listFileSync(g399);
            for (let p399 = 0; p399 < o399.length; p399++) {
                const q399 = o399[p399];
                if (q399.endsWith('.json')) {
                    this.loadPlugin(`${g399}/${q399}`);
                    i399++;
                    h399?.(makeProgress(Math.floor((p399 + 1) / o399.length * 80), `Loaded ${q399}`));
                }
            }
        }
        catch (n399) {
        }
        for (let j399 = 0; j399 < BUILTIN_PLUGINS.length; j399++) {
            const k399 = BUILTIN_PLUGINS[j399];
            const l399 = `${g399}/${k399}.json`;
            try {
                fs.accessSync(l399);
                this.loadPlugin(l399);
            }
            catch (m399) {
                this.loadPlugin(`${g399}/${k399}.py`);
            }
            i399++;
            h399?.(makeProgress(80 + Math.floor((j399 + 1) / BUILTIN_PLUGINS.length * 20), `Loaded ${k399}`));
        }
        h399?.(makeProgress(100, 'Import complete', true));
        return ResultHelper.ok(i399);
    }
    setTopologyCache(f399: SchTopology): void { this.topologyCache = f399; }
    setWaveCache(e399: WaveData[]): void { this.waveCache = e399; }
    private hasPerm(b399: string, c399: PluginPermission): boolean {
        const d399 = this.grantedPerms.get(b399);
        if (d399 === undefined) {
            return false;
        }
        return d399.has(c399);
    }
    private static readTextFile(t398: string): string {
        try {
            const v398 = fs.openSync(t398, fs.OpenMode.READ_ONLY);
            const w398 = fs.statSync(t398);
            const x398 = new ArrayBuffer(w398.size);
            fs.readSync(v398.fd, x398);
            fs.closeSync(v398);
            let y398 = '';
            const z398 = new Uint8Array(x398);
            for (let a399 = 0; a399 < z398.length; a399++) {
                y398 += String.fromCharCode(z398[a399]);
            }
            return y398;
        }
        catch (u398) {
            throw new Error(`Failed to read file: ${t398}`);
        }
    }
}
