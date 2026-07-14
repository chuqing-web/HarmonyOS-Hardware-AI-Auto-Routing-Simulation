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
    constructor(r334: string) {
        this.rootPath = r334.endsWith('/') ? r334.slice(0, -1) : r334;
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
        catch (q334) {
            return { success: false, error: `DeviceLibrary load failed: ${q334}` };
        }
    }
    loadIncremental(): Result<number> {
        try {
            fs.accessSync(this.rootPath);
            const g334 = `${this.rootPath}/library_manifest.json`;
            let h334: LibraryManifest | null = null;
            try {
                const p334 = DeviceLibraryLoader.readTextFile(g334);
                h334 = JSON.parse(p334) as LibraryManifest;
            }
            catch (o334) {
                return this.loadAll();
            }
            if (this.bundles.size === 0) {
                this.loadIndex();
            }
            this.scanDirectory(this.rootPath);
            const i334 = this.collectManifestEntries();
            const j334 = LibraryManifestBuilder.build(i334, '1.0.0');
            const k334 = LibraryManifestBuilder.diffManifests(h334, j334);
            if (k334.length === 0) {
                return { success: true, data: 0 };
            }
            for (let l334 = 0; l334 < k334.length; l334++) {
                const m334 = k334[l334];
                for (let n334 = 0; n334 < i334.length; n334++) {
                    if (i334[n334].libDevId === m334) {
                        this.reloadBundleFromMeta(i334[n334].metaPath);
                        break;
                    }
                }
            }
            this.writeManifest();
            return { success: true, data: k334.length };
        }
        catch (f334) {
            return { success: false, error: `Incremental load failed: ${f334}` };
        }
    }
    getBundle(e334: string): LoadedDeviceBundle | undefined {
        return this.bundles.get(e334);
    }
    getAllBundles(): LoadedDeviceBundle[] {
        return Array.from(this.bundles.values());
    }
    getIndex(): DeviceLibraryIndex | null {
        return this.index;
    }
    toComponentDefinitions(): ComponentDefinition[] {
        const a334: ComponentDefinition[] = [];
        const b334 = Array.from(this.bundles.values());
        for (let c334 = 0; c334 < b334.length; c334++) {
            const d334 = b334[c334];
            a334.push(DeviceMetaAdapter.toComponentDefinition(d334.meta, d334.symbolSvg, d334.simModelText));
        }
        return a334;
    }
    getSpiceModel(y333: string): Result<string> {
        const z333 = this.bundles.get(y333);
        if (!z333)
            return { success: false, error: 'Component not found' };
        if (z333.meta.model_type !== 'spice') {
            return { success: false, error: 'Not a SPICE model device' };
        }
        return { success: true, data: z333.simModelText };
    }
    getMcuModel(u333: string): Result<McuSimModel> {
        const v333 = this.bundles.get(u333);
        if (!v333)
            return { success: false, error: 'Component not found' };
        if (v333.meta.model_type !== 'mcu_51' && v333.meta.model_type !== 'mcu_stm32') {
            return { success: false, error: 'Not an MCU model device' };
        }
        try {
            const x333 = JSON.parse(v333.simModelText) as McuSimModel;
            return { success: true, data: x333 };
        }
        catch (w333) {
            return { success: false, error: `Invalid MCU model JSON: ${w333}` };
        }
    }
    getDigitalModel(s333: string): Result<string> {
        const t333 = this.bundles.get(s333);
        if (!t333)
            return { success: false, error: 'Component not found' };
        if (t333.meta.model_type !== 'digital') {
            return { success: false, error: 'Not a digital model device' };
        }
        return { success: true, data: t333.simModelText };
    }
    getSvgSymbol(q333: string): Result<string> {
        const r333 = this.bundles.get(q333);
        if (!r333)
            return { success: false, error: 'Component not found' };
        return { success: true, data: r333.symbolSvg };
    }
    getDeviceMeta(o333: string): Result<DeviceMeta> {
        const p333 = this.bundles.get(o333);
        if (!p333)
            return { success: false, error: 'Component not found' };
        return { success: true, data: p333.meta };
    }
    private loadIndex(): void {
        const l333 = `${this.rootPath}/index.lib.json`;
        try {
            fs.accessSync(l333);
            const n333 = DeviceLibraryLoader.readTextFile(l333);
            this.index = JSON.parse(n333) as DeviceLibraryIndex;
        }
        catch (m333) {
            this.index = null;
        }
    }
    private scanDirectory(e333: string): void {
        try {
            const g333 = fs.listFileSync(e333);
            for (let h333 = 0; h333 < g333.length; h333++) {
                const i333 = g333[h333];
                const j333 = `${e333}/${i333}`;
                const k333 = fs.statSync(j333);
                if (k333.isDirectory()) {
                    this.scanDirectory(j333);
                }
                else if (i333.endsWith('.meta.json')) {
                    this.loadDeviceBundle(j333);
                }
            }
        }
        catch (f333) {
            throw new Error(String(f333));
        }
    }
    private loadDeviceBundle(t332: string): void {
        try {
            const v332 = DeviceLibraryLoader.readTextFile(t332);
            const w332 = JSON.parse(v332) as DeviceMeta;
            const x332 = t332.substring(0, t332.lastIndexOf('/'));
            const y332 = `${x332}/${w332.symbol_file}`;
            let z332 = DeviceMetaAdapter.defaultSymbol(w332);
            try {
                fs.accessSync(y332);
                z332 = DeviceLibraryLoader.readTextFile(y332);
            }
            catch (d333) { }
            let a333 = '';
            if (w332.sim_model_file) {
                const b333 = `${x332}/${w332.sim_model_file}`;
                try {
                    fs.accessSync(b333);
                    a333 = DeviceLibraryLoader.readTextFile(b333);
                }
                catch (c333) { }
            }
            this.bundles.set(w332.lib_dev_id, { meta: w332, metaDir: x332, symbolSvg: z332, simModelText: a333 });
        }
        catch (u332) {
            console.warn(`[DeviceLibraryLoader] Skip ${t332}: ${u332}`);
        }
    }
    private static readTextFile(o332: string): string {
        try {
            const q332 = fs.openSync(o332, fs.OpenMode.READ_ONLY);
            const r332 = fs.statSync(o332);
            const s332 = new ArrayBuffer(r332.size);
            fs.readSync(q332.fd, s332);
            fs.closeSync(q332);
            return arrayBufferToString(s332);
        }
        catch (p332) {
            throw new Error(String(p332));
        }
    }
    private writeManifest(): void {
        const j332 = this.collectManifestEntries();
        const k332 = LibraryManifestBuilder.build(j332, '1.0.0');
        const l332 = `${this.rootPath}/library_manifest.json`;
        try {
            const n332 = fs.openSync(l332, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(n332.fd, JSON.stringify(k332, null, 2));
            fs.closeSync(n332);
        }
        catch (m332) {
            console.warn(`[DeviceLibraryLoader] manifest write failed: ${m332}`);
        }
    }
    private collectManifestEntries(): LibraryManifestEntry[] {
        const e332: LibraryManifestEntry[] = [];
        this.bundles.forEach((f332, g332: string) => {
            const h332 = `${f332.metaDir}/${g332}.meta.json`;
            const i332 = LibraryManifestBuilder.hashContent(JSON.stringify(f332.meta));
            e332.push({
                libDevId: g332,
                metaPath: h332,
                metaHash: i332,
                symbolPath: `${f332.metaDir}/${f332.meta.symbol_file}`,
                modelPath: f332.meta.sim_model_file ? `${f332.metaDir}/${f332.meta.sim_model_file}` : ''
            });
        });
        return e332;
    }
    private reloadBundleFromMeta(d332: string): void {
        this.loadDeviceBundle(d332);
    }
}
