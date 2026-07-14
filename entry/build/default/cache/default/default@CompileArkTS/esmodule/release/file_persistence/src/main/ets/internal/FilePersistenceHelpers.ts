import { CryptoUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, SnapshotMeta, CollabChangeLogEntry, SchematicAnnotation, ChangeLogEntry, ProjectSnapshot, CollaborationData } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectData } from '../api/IFilePersistence';
import util from "@ohos:util";
export interface BomLineItem {
    qty: number;
    refDes: string[];
}
export function copyStringArray(i360: string[]): string[] {
    const j360: string[] = [];
    for (let k360 = 0; k360 < i360.length; k360++) {
        j360.push(i360[k360]);
    }
    return j360;
}
export function appendStringArray(f360: string[], g360: string[]): void {
    for (let h360 = 0; h360 < g360.length; h360++) {
        f360.push(g360[h360]);
    }
}
export function copySnapshotMetaArray(c360: SnapshotMeta[]): SnapshotMeta[] {
    const d360: SnapshotMeta[] = [];
    for (let e360 = 0; e360 < c360.length; e360++) {
        d360.push(c360[e360]);
    }
    return d360;
}
export function copyCollabChangeLogArray(z359: CollabChangeLogEntry[]): CollabChangeLogEntry[] {
    const a360: CollabChangeLogEntry[] = [];
    for (let b360 = 0; b360 < z359.length; b360++) {
        a360.push(z359[b360]);
    }
    return a360;
}
export function copySchematicAnnotationArray(w359: SchematicAnnotation[]): SchematicAnnotation[] {
    const x359: SchematicAnnotation[] = [];
    for (let y359 = 0; y359 < w359.length; y359++) {
        x359.push(w359[y359]);
    }
    return x359;
}
export function copyChangeLogEntryArray(t359: ChangeLogEntry[]): ChangeLogEntry[] {
    const u359: ChangeLogEntry[] = [];
    for (let v359 = 0; v359 < t359.length; v359++) {
        u359.push(t359[v359]);
    }
    return u359;
}
export function copyProjectSnapshotArray(q359: ProjectSnapshot[]): ProjectSnapshot[] {
    const r359: ProjectSnapshot[] = [];
    for (let s359 = 0; s359 < q359.length; s359++) {
        r359.push(q359[s359]);
    }
    return r359;
}
export function arrayBufferToString(m359: ArrayBuffer): string {
    const n359 = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    const o359 = new Uint8Array(m359);
    const p359 = n359.decodeToString(o359);
    return p359;
}
export function maxOfNumbers(j359: number[]): number {
    let k359 = 0;
    for (let l359 = 0; l359 < j359.length; l359++) {
        if (j359[l359] > k359) {
            k359 = j359[l359];
        }
    }
    return k359;
}
export function mergeUniqueStrings(b359: string[], c359: string[]): string[] {
    const d359 = new Set<string>();
    const e359: string[] = [];
    for (let h359 = 0; h359 < b359.length; h359++) {
        const i359 = b359[h359];
        if (!d359.has(i359)) {
            d359.add(i359);
            e359.push(i359);
        }
    }
    for (let f359 = 0; f359 < c359.length; f359++) {
        const g359 = c359[f359];
        if (!d359.has(g359)) {
            d359.add(g359);
            e359.push(g359);
        }
    }
    return e359;
}
export function copyAiApiConfigForSave(y358: AiApiConfig): AiApiConfig {
    let z358 = y358.apiKey;
    if (y358.apiKey && y358.apiKey !== '***') {
        z358 = CryptoUtil.encrypt(y358.apiKey);
    }
    const a359: AiApiConfig = {
        id: y358.id,
        name: y358.name,
        provider: y358.provider,
        baseUrl: y358.baseUrl,
        apiKey: z358,
        model: y358.model,
        enabled: y358.enabled,
        priority: y358.priority,
        maxTokens: y358.maxTokens,
        temperature: y358.temperature
    };
    if (y358.backupApiKey) {
        a359.backupApiKey = CryptoUtil.encrypt(y358.backupApiKey);
    }
    if (y358.contextLimit !== undefined) {
        a359.contextLimit = y358.contextLimit;
    }
    if (y358.proxyUrl !== undefined) {
        a359.proxyUrl = y358.proxyUrl;
    }
    if (y358.customHeaders !== undefined) {
        a359.customHeaders = y358.customHeaders;
    }
    if (y358.capabilityBinding !== undefined) {
        a359.capabilityBinding = y358.capabilityBinding;
    }
    if (y358.remark !== undefined) {
        a359.remark = y358.remark;
    }
    if (y358.lastStatus !== undefined) {
        a359.lastStatus = y358.lastStatus;
    }
    if (y358.lastTestedAt !== undefined) {
        a359.lastTestedAt = y358.lastTestedAt;
    }
    if (y358.dailyCallCount !== undefined) {
        a359.dailyCallCount = y358.dailyCallCount;
    }
    if (y358.taskBind !== undefined) {
        a359.taskBind = y358.taskBind;
    }
    return a359;
}
export function copyAiApiConfigEncrypted(w358: AiApiConfig): AiApiConfig {
    const x358: AiApiConfig = {
        id: w358.id,
        name: w358.name,
        provider: w358.provider,
        baseUrl: w358.baseUrl,
        apiKey: w358.apiKey ? CryptoUtil.encrypt(w358.apiKey) : '',
        model: w358.model,
        enabled: w358.enabled,
        priority: w358.priority,
        maxTokens: w358.maxTokens,
        temperature: w358.temperature
    };
    if (w358.backupApiKey) {
        x358.backupApiKey = CryptoUtil.encrypt(w358.backupApiKey);
    }
    if (w358.contextLimit !== undefined) {
        x358.contextLimit = w358.contextLimit;
    }
    if (w358.proxyUrl !== undefined) {
        x358.proxyUrl = w358.proxyUrl;
    }
    if (w358.customHeaders !== undefined) {
        x358.customHeaders = w358.customHeaders;
    }
    if (w358.capabilityBinding !== undefined) {
        x358.capabilityBinding = w358.capabilityBinding;
    }
    if (w358.remark !== undefined) {
        x358.remark = w358.remark;
    }
    if (w358.lastStatus !== undefined) {
        x358.lastStatus = w358.lastStatus;
    }
    if (w358.lastTestedAt !== undefined) {
        x358.lastTestedAt = w358.lastTestedAt;
    }
    if (w358.dailyCallCount !== undefined) {
        x358.dailyCallCount = w358.dailyCallCount;
    }
    if (w358.taskBind !== undefined) {
        x358.taskBind = w358.taskBind;
    }
    return x358;
}
export function encryptAiApiConfigsForSave(t358: AiApiConfig[]): AiApiConfig[] {
    const u358: AiApiConfig[] = [];
    for (let v358 = 0; v358 < t358.length; v358++) {
        u358.push(copyAiApiConfigForSave(t358[v358]));
    }
    return u358;
}
export function encryptAiApiConfigs(q358: AiApiConfig[]): AiApiConfig[] {
    const r358: AiApiConfig[] = [];
    for (let s358 = 0; s358 < q358.length; s358++) {
        r358.push(copyAiApiConfigEncrypted(q358[s358]));
    }
    return r358;
}
export function buildProjectDataForSave(k358: ProjectData, l358: string, m358: string, n358: CollaborationData, o358: AiApiConfig[]): ProjectData {
    const p358: ProjectData = {
        magic: 'SCHSIM',
        version: l358,
        name: k358.name,
        topology: k358.topology,
        simConfig: k358.simConfig,
        aiConfigs: o358,
        createdAt: k358.createdAt,
        modifiedAt: m358,
        collaboration: k358.collaboration !== undefined ? k358.collaboration : n358
    };
    if (k358.autoBackupEnabled !== undefined) {
        p358.autoBackupEnabled = k358.autoBackupEnabled;
    }
    if (k358.backupPath !== undefined) {
        p358.backupPath = k358.backupPath;
    }
    return p358;
}
export function emptyParameters(): Map<string, string> {
    return new Map<string, string>();
}
