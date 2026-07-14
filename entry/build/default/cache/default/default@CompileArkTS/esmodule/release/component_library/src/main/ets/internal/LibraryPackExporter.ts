import fs from "@ohos:file.fs";
import { CryptoUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Result } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface LibraryPackManifest {
    version: string;
    deviceCount: number;
    files: string[];
    packHash: string;
}
export class LibraryPackExporter {
    static exportPack(a330: string, b330: string): Result<string> {
        try {
            const d330 = `${b330}/library_pack`;
            fs.mkdirSync(d330);
            const e330: string[] = [];
            LibraryPackExporter.copyRecursive(a330, d330, e330);
            const f330: LibraryPackManifest = {
                version: '1.0.0',
                deviceCount: e330.filter(i330 => i330.endsWith('.meta.json')).length,
                files: e330,
                packHash: CryptoUtil.sha256(e330.join('|')).substring(0, 16)
            };
            const g330 = `${d330}/pack_manifest.json`;
            const h330 = fs.openSync(g330, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(h330.fd, JSON.stringify(f330, null, 2));
            fs.closeSync(h330);
            return { success: true, data: d330 };
        }
        catch (c330) {
            return { success: false, error: `${c330}` };
        }
    }
    static importPack(o329: string, p329: string): Result<number> {
        try {
            const r329 = `${o329}/pack_manifest.json`;
            const s329 = LibraryPackExporter.readText(r329);
            const t329 = JSON.parse(s329) as LibraryPackManifest;
            let u329 = 0;
            for (let v329 = 0; v329 < t329.files.length; v329++) {
                const w329 = t329.files[v329];
                const x329 = `${o329}/${w329}`;
                const y329 = `${p329}/${w329}`;
                try {
                    fs.accessSync(x329);
                    LibraryPackExporter.ensureParent(y329);
                    LibraryPackExporter.copyFile(x329, y329);
                    u329++;
                }
                catch (z329) { }
            }
            return { success: true, data: u329 };
        }
        catch (q329) {
            return { success: false, error: `${q329}` };
        }
    }
    private static copyRecursive(d329: string, e329: string, f329: string[]): void {
        try {
            const h329 = fs.listFileSync(d329);
            for (let i329 = 0; i329 < h329.length; i329++) {
                const j329 = h329[i329];
                const k329 = `${d329}/${j329}`;
                const l329 = `${e329}/${j329}`;
                const m329 = fs.statSync(k329);
                if (m329.isDirectory()) {
                    try {
                        fs.mkdirSync(l329);
                    }
                    catch (n329) { }
                    LibraryPackExporter.copyRecursive(k329, l329, f329);
                }
                else {
                    LibraryPackExporter.copyFile(k329, l329);
                    f329.push(j329);
                }
            }
        }
        catch (g329) {
            throw new Error(String(g329));
        }
    }
    private static copyFile(w328: string, x328: string): void {
        try {
            const z328 = fs.openSync(w328, fs.OpenMode.READ_ONLY);
            const a329 = fs.statSync(w328);
            const b329 = new ArrayBuffer(a329.size);
            fs.readSync(z328.fd, b329);
            fs.closeSync(z328);
            LibraryPackExporter.ensureParent(x328);
            const c329 = fs.openSync(x328, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(c329.fd, b329);
            fs.closeSync(c329);
        }
        catch (y328) {
            throw new Error(String(y328));
        }
    }
    private static ensureParent(t328: string): void {
        const u328 = t328.lastIndexOf('/');
        if (u328 > 0) {
            try {
                fs.mkdirSync(t328.substring(0, u328));
            }
            catch (v328) { }
        }
    }
    private static readText(l328: string): string {
        try {
            const n328 = fs.openSync(l328, fs.OpenMode.READ_ONLY);
            const o328 = fs.statSync(l328);
            const p328 = new ArrayBuffer(o328.size);
            fs.readSync(n328.fd, p328);
            fs.closeSync(n328);
            let q328 = '';
            const r328 = new Uint8Array(p328);
            for (let s328 = 0; s328 < r328.length; s328++)
                q328 += String.fromCharCode(r328[s328]);
            return q328;
        }
        catch (m328) {
            throw new Error(String(m328));
        }
    }
}
