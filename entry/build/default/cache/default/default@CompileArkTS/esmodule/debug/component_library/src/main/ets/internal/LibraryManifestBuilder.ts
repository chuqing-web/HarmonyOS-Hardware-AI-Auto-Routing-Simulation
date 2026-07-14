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
    static build(entries: LibraryManifestEntry[], version: string): LibraryManifest {
        return {
            version: version,
            generatedAt: new Date().toISOString(),
            deviceCount: entries.length,
            entries: entries
        };
    }
    static hashContent(content: string): string {
        return CryptoUtil.sha256(content).substring(0, 16);
    }
    static diffManifests(oldM: LibraryManifest, newM: LibraryManifest): string[] {
        const changed: string[] = [];
        const oldMap = new Map<string, string>();
        for (let i = 0; i < oldM.entries.length; i++) {
            oldMap.set(oldM.entries[i].libDevId, oldM.entries[i].metaHash);
        }
        for (let i = 0; i < newM.entries.length; i++) {
            const e = newM.entries[i];
            const prev = oldMap.get(e.libDevId);
            if (prev === undefined || prev !== e.metaHash) {
                changed.push(e.libDevId);
            }
        }
        return changed;
    }
}
