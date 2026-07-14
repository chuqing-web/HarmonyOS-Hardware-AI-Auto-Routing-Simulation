import fs from "@ohos:file.fs";
import type { DeviceMeta, DeviceLibraryIndex, LoadedDeviceBundle, McuSimModel, Result } from 'common';
import { DeviceMetaAdapter } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/loader/DeviceMetaAdapter";
import type { ComponentDefinition } from '../api/IComponentLibrary';
import { arrayBufferToString } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ComponentLibHelpers";
import { LibraryManifestBuilder } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/LibraryManifestBuilder";
import type { LibraryManifestEntry, LibraryManifest } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/LibraryManifestBuilder";
export class DeviceLibraryLoader {
    private rootPath: string;
    private bundles: Map<string, LoadedDeviceBundle> = new Map();
    private index: DeviceLibraryIndex | null = null;
    constructor(rootPath: string) {
        this.rootPath = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
    }
    loadAll(): Result<number> {
        try {
            fs.accessSync(this.rootPath);
            this.bundles.clear();
            this.loadIndex();
            this.scanDirectory(this.rootPath);
            this.writeManifest();
            return { success: true, data: this.bundles.size };
        }
        catch (e) {
            return { success: false, error: `DeviceLibrary load failed: ${e}` };
        }
    }
    /** 增量热更新 — 仅重载 manifest 中 hash 变更的器件 */
    loadIncremental(): Result<number> {
        try {
            fs.accessSync(this.rootPath);
            const manifestPath = `${this.rootPath}/library_manifest.json`;
            let oldManifest: LibraryManifest | null = null;
            try {
                const text = DeviceLibraryLoader.readTextFile(manifestPath);
                oldManifest = JSON.parse(text) as LibraryManifest;
            }
            catch (_e) {
                return this.loadAll();
            }
            if (this.bundles.size === 0) {
                this.loadIndex();
            }
            this.scanDirectory(this.rootPath);
            const newEntries = this.collectManifestEntries();
            const newManifest = LibraryManifestBuilder.build(newEntries, '1.0.0');
            const changedIds = LibraryManifestBuilder.diffManifests(oldManifest, newManifest);
            if (changedIds.length === 0) {
                return { success: true, data: 0 };
            }
            for (let i = 0; i < changedIds.length; i++) {
                const libDevId = changedIds[i];
                for (let j = 0; j < newEntries.length; j++) {
                    if (newEntries[j].libDevId === libDevId) {
                        this.reloadBundleFromMeta(newEntries[j].metaPath);
                        break;
                    }
                }
            }
            this.writeManifest();
            return { success: true, data: changedIds.length };
        }
        catch (e) {
            return { success: false, error: `Incremental load failed: ${e}` };
        }
    }
    getBundle(libDevId: string): LoadedDeviceBundle | undefined {
        return this.bundles.get(libDevId);
    }
    getAllBundles(): LoadedDeviceBundle[] {
        return Array.from(this.bundles.values());
    }
    getIndex(): DeviceLibraryIndex | null {
        return this.index;
    }
    toComponentDefinitions(): ComponentDefinition[] {
        const list: ComponentDefinition[] = [];
        const bundles = Array.from(this.bundles.values());
        for (let i = 0; i < bundles.length; i++) {
            const bundle = bundles[i];
            list.push(DeviceMetaAdapter.toComponentDefinition(bundle.meta, bundle.symbolSvg, bundle.simModelText));
        }
        return list;
    }
    getSpiceModel(libDevId: string): Result<string> {
        const bundle = this.bundles.get(libDevId);
        if (!bundle)
            return { success: false, error: 'Component not found' };
        if (bundle.meta.model_type !== 'spice') {
            return { success: false, error: 'Not a SPICE model device' };
        }
        return { success: true, data: bundle.simModelText };
    }
    getMcuModel(libDevId: string): Result<McuSimModel> {
        const bundle = this.bundles.get(libDevId);
        if (!bundle)
            return { success: false, error: 'Component not found' };
        if (bundle.meta.model_type !== 'mcu_51' && bundle.meta.model_type !== 'mcu_stm32') {
            return { success: false, error: 'Not an MCU model device' };
        }
        try {
            const model = JSON.parse(bundle.simModelText) as McuSimModel;
            return { success: true, data: model };
        }
        catch (e) {
            return { success: false, error: `Invalid MCU model JSON: ${e}` };
        }
    }
    getDigitalModel(libDevId: string): Result<string> {
        const bundle = this.bundles.get(libDevId);
        if (!bundle)
            return { success: false, error: 'Component not found' };
        if (bundle.meta.model_type !== 'digital') {
            return { success: false, error: 'Not a digital model device' };
        }
        return { success: true, data: bundle.simModelText };
    }
    getSvgSymbol(libDevId: string): Result<string> {
        const bundle = this.bundles.get(libDevId);
        if (!bundle)
            return { success: false, error: 'Component not found' };
        return { success: true, data: bundle.symbolSvg };
    }
    getDeviceMeta(libDevId: string): Result<DeviceMeta> {
        const bundle = this.bundles.get(libDevId);
        if (!bundle)
            return { success: false, error: 'Component not found' };
        return { success: true, data: bundle.meta };
    }
    private loadIndex(): void {
        const indexPath = `${this.rootPath}/index.lib.json`;
        try {
            fs.accessSync(indexPath);
            const content = DeviceLibraryLoader.readTextFile(indexPath);
            this.index = JSON.parse(content) as DeviceLibraryIndex;
        }
        catch (_e) {
            this.index = null;
        }
    }
    private scanDirectory(dir: string): void {
        try {
            const entries = fs.listFileSync(dir);
            for (let i = 0; i < entries.length; i++) {
                const name = entries[i];
                const fullPath = `${dir}/${name}`;
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    this.scanDirectory(fullPath);
                }
                else if (name.endsWith('.meta.json')) {
                    this.loadDeviceBundle(fullPath);
                }
            }
        }
        catch (e) {
            throw new Error(String(e));
        }
    }
    private loadDeviceBundle(metaPath: string): void {
        try {
            const metaJson = DeviceLibraryLoader.readTextFile(metaPath);
            const meta = JSON.parse(metaJson) as DeviceMeta;
            const metaDir = metaPath.substring(0, metaPath.lastIndexOf('/'));
            const symbolPath = `${metaDir}/${meta.symbol_file}`;
            let symbolSvg = DeviceMetaAdapter.defaultSymbol(meta);
            try {
                fs.accessSync(symbolPath);
                symbolSvg = DeviceLibraryLoader.readTextFile(symbolPath);
            }
            catch (_e) { /* use generated fallback */ }
            let simModelText = '';
            if (meta.sim_model_file) {
                const modelPath = `${metaDir}/${meta.sim_model_file}`;
                try {
                    fs.accessSync(modelPath);
                    simModelText = DeviceLibraryLoader.readTextFile(modelPath);
                }
                catch (_e) { /* optional model */ }
            }
            this.bundles.set(meta.lib_dev_id, { meta, metaDir, symbolSvg, simModelText });
        }
        catch (e) {
            console.warn(`[DeviceLibraryLoader] Skip ${metaPath}: ${e}`);
        }
    }
    private static readTextFile(path: string): string {
        try {
            const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(path);
            const buffer = new ArrayBuffer(stat.size);
            fs.readSync(fileHandle.fd, buffer);
            fs.closeSync(fileHandle);
            return arrayBufferToString(buffer);
        }
        catch (e) {
            throw new Error(String(e));
        }
    }
    private writeManifest(): void {
        const entries = this.collectManifestEntries();
        const manifest = LibraryManifestBuilder.build(entries, '1.0.0');
        const outPath = `${this.rootPath}/library_manifest.json`;
        try {
            const file = fs.openSync(outPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(file.fd, JSON.stringify(manifest, null, 2));
            fs.closeSync(file);
        }
        catch (e) {
            console.warn(`[DeviceLibraryLoader] manifest write failed: ${e}`);
        }
    }
    private collectManifestEntries(): LibraryManifestEntry[] {
        const entries: LibraryManifestEntry[] = [];
        this.bundles.forEach((bundle, libDevId: string) => {
            const metaPath = `${bundle.metaDir}/${libDevId}.meta.json`;
            const metaHash = LibraryManifestBuilder.hashContent(JSON.stringify(bundle.meta));
            entries.push({
                libDevId: libDevId,
                metaPath: metaPath,
                metaHash: metaHash,
                symbolPath: `${bundle.metaDir}/${bundle.meta.symbol_file}`,
                modelPath: bundle.meta.sim_model_file ? `${bundle.metaDir}/${bundle.meta.sim_model_file}` : ''
            });
        });
        return entries;
    }
    private reloadBundleFromMeta(metaPath: string): void {
        this.loadDeviceBundle(metaPath);
    }
}
