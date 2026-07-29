import { CryptoUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiApiConfig, SnapshotMeta, CollabChangeLogEntry, SchematicAnnotation, ChangeLogEntry, ProjectSnapshot, CollaborationData } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectData } from '../api/IFilePersistence';
import util from "@ohos:util";
export interface BomLineItem {
    qty: number;
    refDes: string[];
}
export function copyStringArray(source: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function appendStringArray(target: string[], source: string[]): void {
    for (let i = 0; i < source.length; i++) {
        target.push(source[i]);
    }
}
export function copySnapshotMetaArray(source: SnapshotMeta[]): SnapshotMeta[] {
    const result: SnapshotMeta[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function copyCollabChangeLogArray(source: CollabChangeLogEntry[]): CollabChangeLogEntry[] {
    const result: CollabChangeLogEntry[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function copySchematicAnnotationArray(source: SchematicAnnotation[]): SchematicAnnotation[] {
    const result: SchematicAnnotation[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function copyChangeLogEntryArray(source: ChangeLogEntry[]): ChangeLogEntry[] {
    const result: ChangeLogEntry[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function copyProjectSnapshotArray(source: ProjectSnapshot[]): ProjectSnapshot[] {
    const result: ProjectSnapshot[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function arrayBufferToString(buffer: ArrayBuffer): string {
    const decoder = util.TextDecoder.create('utf-8', { ignoreBOM: true });
    const input = new Uint8Array(buffer);
    const result = decoder.decodeToString(input);
    return result;
}
export function maxOfNumbers(values: number[]): number {
    let max = 0;
    for (let i = 0; i < values.length; i++) {
        if (values[i] > max) {
            max = values[i];
        }
    }
    return max;
}
export function mergeUniqueStrings(first: string[], second: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (let i = 0; i < first.length; i++) {
        const item = first[i];
        if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
        }
    }
    for (let i = 0; i < second.length; i++) {
        const item = second[i];
        if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
        }
    }
    return result;
}
export function copyAiApiConfigForSave(c: AiApiConfig): AiApiConfig {
    let apiKey = c.apiKey;
    if (c.apiKey && c.apiKey !== '***') {
        apiKey = CryptoUtil.encrypt(c.apiKey);
    }
    const result: AiApiConfig = {
        id: c.id,
        name: c.name,
        provider: c.provider,
        baseUrl: c.baseUrl,
        apiKey: apiKey,
        model: c.model,
        enabled: c.enabled,
        priority: c.priority,
        maxTokens: c.maxTokens,
        temperature: c.temperature
    };
    if (c.backupApiKey) {
        result.backupApiKey = CryptoUtil.encrypt(c.backupApiKey);
    }
    if (c.contextLimit !== undefined) {
        result.contextLimit = c.contextLimit;
    }
    if (c.proxyUrl !== undefined) {
        result.proxyUrl = c.proxyUrl;
    }
    if (c.customHeaders !== undefined) {
        result.customHeaders = c.customHeaders;
    }
    if (c.capabilityBinding !== undefined) {
        result.capabilityBinding = c.capabilityBinding;
    }
    if (c.remark !== undefined) {
        result.remark = c.remark;
    }
    if (c.lastStatus !== undefined) {
        result.lastStatus = c.lastStatus;
    }
    if (c.lastTestedAt !== undefined) {
        result.lastTestedAt = c.lastTestedAt;
    }
    if (c.dailyCallCount !== undefined) {
        result.dailyCallCount = c.dailyCallCount;
    }
    if (c.taskBind !== undefined) {
        result.taskBind = c.taskBind;
    }
    return result;
}
export function copyAiApiConfigEncrypted(c: AiApiConfig): AiApiConfig {
    const result: AiApiConfig = {
        id: c.id,
        name: c.name,
        provider: c.provider,
        baseUrl: c.baseUrl,
        apiKey: c.apiKey ? CryptoUtil.encrypt(c.apiKey) : '',
        model: c.model,
        enabled: c.enabled,
        priority: c.priority,
        maxTokens: c.maxTokens,
        temperature: c.temperature
    };
    if (c.backupApiKey) {
        result.backupApiKey = CryptoUtil.encrypt(c.backupApiKey);
    }
    if (c.contextLimit !== undefined) {
        result.contextLimit = c.contextLimit;
    }
    if (c.proxyUrl !== undefined) {
        result.proxyUrl = c.proxyUrl;
    }
    if (c.customHeaders !== undefined) {
        result.customHeaders = c.customHeaders;
    }
    if (c.capabilityBinding !== undefined) {
        result.capabilityBinding = c.capabilityBinding;
    }
    if (c.remark !== undefined) {
        result.remark = c.remark;
    }
    if (c.lastStatus !== undefined) {
        result.lastStatus = c.lastStatus;
    }
    if (c.lastTestedAt !== undefined) {
        result.lastTestedAt = c.lastTestedAt;
    }
    if (c.dailyCallCount !== undefined) {
        result.dailyCallCount = c.dailyCallCount;
    }
    if (c.taskBind !== undefined) {
        result.taskBind = c.taskBind;
    }
    return result;
}
export function encryptAiApiConfigsForSave(configs: AiApiConfig[]): AiApiConfig[] {
    const result: AiApiConfig[] = [];
    for (let i = 0; i < configs.length; i++) {
        result.push(copyAiApiConfigForSave(configs[i]));
    }
    return result;
}
export function encryptAiApiConfigs(configs: AiApiConfig[]): AiApiConfig[] {
    const result: AiApiConfig[] = [];
    for (let i = 0; i < configs.length; i++) {
        result.push(copyAiApiConfigEncrypted(configs[i]));
    }
    return result;
}
/** 5.1.1 添加文件格式魔数 "SCHSIM" */
export function buildProjectDataForSave(data: ProjectData, version: string, modifiedAt: string, collaboration: CollaborationData, encryptedConfigs: AiApiConfig[]): ProjectData {
    const result: ProjectData = {
        magic: 'SCHSIM',
        version: version,
        name: data.name,
        topology: data.topology,
        simConfig: data.simConfig,
        aiConfigs: encryptedConfigs,
        createdAt: data.createdAt,
        modifiedAt: modifiedAt,
        collaboration: data.collaboration !== undefined ? data.collaboration : collaboration
    };
    if (data.autoBackupEnabled !== undefined) {
        result.autoBackupEnabled = data.autoBackupEnabled;
    }
    if (data.backupPath !== undefined) {
        result.backupPath = data.backupPath;
    }
    if (data.pcb !== undefined) {
        result.pcb = data.pcb;
    }
    return result;
}
export function emptyParameters(): Map<string, string> {
    return new Map<string, string>();
}
