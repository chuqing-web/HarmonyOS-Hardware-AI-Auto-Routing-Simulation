import { CryptoUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface LibraryManifestEntry {
    libDevId: string;
    metaPath: string;
    metaHash: string;
    symbolPath: string;
    modelPath: string;
}
export interface LibraryManifest {
    version: string;
    generatedAt: string;
    deviceCount: number;
    entries: LibraryManifestEntry[];
}
export class LibraryManifestBuilder {
    static build(j328: LibraryManifestEntry[], k328: string): LibraryManifest {
        return {
            version: k328,
            generatedAt: new Date().toISOString(),
            deviceCount: j328.length,
            entries: j328
        };
    }
    static hashContent(i328: string): string {
        return CryptoUtil.sha256(i328).substring(0, 16);
    }
    static diffManifests(a328: LibraryManifest, b328: LibraryManifest): string[] {
        const c328: string[] = [];
        const d328 = new Map<string, string>();
        for (let h328 = 0; h328 < a328.entries.length; h328++) {
            d328.set(a328.entries[h328].libDevId, a328.entries[h328].metaHash);
        }
        for (let e328 = 0; e328 < b328.entries.length; e328++) {
            const f328 = b328.entries[e328];
            const g328 = d328.get(f328.libDevId);
            if (g328 === undefined || g328 !== f328.metaHash) {
                c328.push(f328.libDevId);
            }
        }
        return c328;
    }
}
