import fs from "@ohos:file.fs";
import { CryptoUtil, IdUtil, ResultHelper, ErrCode, FeatureGate, emptySchTopology, mapAwareStringify, serializeMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, ApiResult, SnapshotMeta, TopologySnapshotDiff, VersionCompareReport, CollabChangeLogEntry, ProjectLockInfo, ProjectAccessMode, CollaborationData, SchematicAnnotation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { arrayBufferToString, appendStringArray, copyCollabChangeLogArray, copySchematicAnnotationArray, copySnapshotMetaArray, mergeUniqueStrings } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
interface TopologyDeviceSlim {
    id: string;
    lib: string;
    p: Object;
}
interface TopologyHashPayload {
    devices: TopologyDeviceSlim[];
    nets: number;
    wires: number;
}
export class CollaborationService {
    private snapshots: SnapshotMeta[] = [];
    private changeLog: CollabChangeLogEntry[] = [];
    private snapshotBaseDir: string = 'collaboration/snapshots';
    private lockPath: string = '';
    init(h340: string): void {
        this.snapshotBaseDir = `${h340}/collaboration/snapshots`;
        try {
            fs.mkdirSync(this.snapshotBaseDir, true);
        }
        catch (i340) { }
    }
    loadCollaborationData(g340: CollaborationData | undefined): void {
        this.snapshots = g340 !== undefined && g340.snapshots !== undefined
            ? copySnapshotMetaArray(g340.snapshots) : [];
        this.changeLog = g340 !== undefined && g340.changeLog !== undefined
            ? copyCollabChangeLogArray(g340.changeLog) : [];
    }
    exportCollaborationData(f340: SchematicAnnotation[]): CollaborationData {
        return {
            annotations: copySchematicAnnotationArray(f340),
            snapshots: copySnapshotMetaArray(this.snapshots),
            changeLog: copyCollabChangeLogArray(this.changeLog)
        };
    }
    createSnapshot(t339: string, u339: string, v339: SchTopology, w339: string, x339?: SchTopology): ApiResult<SnapshotMeta> {
        const y339 = FeatureGate.canUseVersionCompare();
        if (!y339.success) {
            return ResultHelper.fail(y339.errCode ?? ErrCode.ERR_FEATURE_LOCKED, y339.error);
        }
        const z339 = CollaborationService.topologyHash(v339);
        const a340 = `snap_${Date.now()}`;
        const b340 = `${this.snapshotBaseDir}/${a340}.diff.json`;
        const c340 = x339 ? CollaborationService.computeDiff(x339, v339)
            : CollaborationService.computeDiff(emptySchTopology(), v339);
        c340.baseHash = x339 ? CollaborationService.topologyHash(x339) : '';
        c340.snapshotHash = z339;
        try {
            CollaborationService.writeJson(b340, c340);
        }
        catch (e340) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `快照保存失败: ${e340}`);
        }
        const d340: SnapshotMeta = {
            id: a340,
            versionLabel: t339,
            note: u339,
            timestamp: new Date().toISOString(),
            topologyHash: z339,
            diffFilePath: b340,
            author: w339
        };
        this.snapshots.push(d340);
        this.appendChangeLog(w339, 'snapshot', t339, u339);
        return ResultHelper.ok(d340);
    }
    listSnapshots(): SnapshotMeta[] {
        return copySnapshotMetaArray(this.snapshots);
    }
    compareTopologies(r339: SchTopology, s339: SchTopology): TopologySnapshotDiff {
        return CollaborationService.computeDiff(r339, s339);
    }
    compareSnapshots(d339: string, e339: string, f339: SchTopology): ApiResult<VersionCompareReport> {
        const g339 = FeatureGate.canUseVersionCompare();
        if (!g339.success) {
            return ResultHelper.fail(g339.errCode ?? ErrCode.ERR_FEATURE_LOCKED, g339.error);
        }
        const h339 = this.snapshots.find(q339 => q339.id === d339);
        const i339 = this.snapshots.find(p339 => p339.id === e339);
        if (!h339 || !i339) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '快照不存在');
        }
        let j339: TopologySnapshotDiff;
        let k339: TopologySnapshotDiff;
        try {
            j339 = CollaborationService.readJson(h339.diffFilePath) as TopologySnapshotDiff;
            k339 = CollaborationService.readJson(i339.diffFilePath) as TopologySnapshotDiff;
        }
        catch (o339) {
            return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `读取快照 diff 失败: ${o339}`);
        }
        const l339: TopologySnapshotDiff = {
            baseHash: h339.topologyHash,
            snapshotHash: i339.topologyHash,
            addedDevices: k339.addedDevices.filter(n339 => !j339.addedDevices.includes(n339)),
            removedDevices: mergeUniqueStrings(j339.removedDevices, k339.removedDevices),
            modifiedDevices: mergeUniqueStrings(j339.modifiedDevices, k339.modifiedDevices),
            addedNets: mergeUniqueStrings(j339.addedNets, k339.addedNets),
            removedNets: mergeUniqueStrings(j339.removedNets, k339.removedNets),
            modifiedParams: mergeUniqueStrings(j339.modifiedParams, k339.modifiedParams),
            wireCountDelta: k339.wireCountDelta - j339.wireCountDelta,
            hexConfigChanged: j339.hexConfigChanged || k339.hexConfigChanged
        };
        const m339: VersionCompareReport = {
            fromSnapshotId: d339,
            toSnapshotId: e339,
            diff: l339,
            powerChanges: CollaborationService.filterCategory(l339, ['VCC', 'VDD', 'GND', 'POWER']),
            mcuChanges: CollaborationService.filterCategory(l339, ['STM32', 'AT89', 'STC', 'MCU']),
            peripheralChanges: CollaborationService.filterCategory(l339, ['LCD', 'OLED', 'RELAY', 'SW_']),
            summaryLines: CollaborationService.buildSummary(l339, h339.versionLabel, i339.versionLabel)
        };
        return ResultHelper.ok(m339);
    }
    appendChangeLog(y338: string, z338: string, a339: string, b339: string): CollabChangeLogEntry {
        const c339: CollabChangeLogEntry = {
            id: IdUtil.generate('log'),
            timestamp: new Date().toISOString(),
            user: y338,
            action: z338,
            target: a339,
            detail: b339
        };
        this.changeLog.push(c339);
        if (this.changeLog.length > 5000) {
            this.changeLog = this.changeLog.slice(-5000);
        }
        return c339;
    }
    getChangeLog(): CollabChangeLogEntry[] {
        return copyCollabChangeLogArray(this.changeLog);
    }
    acquireLock(q338: string, r338: string, s338: string, t338: ProjectAccessMode): ApiResult<ProjectLockInfo> {
        this.lockPath = `${q338}.lock`;
        try {
            if (fs.accessSync(this.lockPath)) {
                const x338 = CollaborationService.readJson(this.lockPath) as ProjectLockInfo;
                if (!x338.stale && x338.holderId !== r338) {
                    return ResultHelper.fail(ErrCode.ERR_PROJECT_LOCKED, `工程已被 ${x338.holderName} 以${x338.mode === 'editable' ? '编辑' : '只读'}模式打开`);
                }
            }
        }
        catch (w338) { }
        const u338: ProjectLockInfo = {
            projectPath: q338,
            holderId: r338,
            holderName: s338,
            mode: t338,
            acquiredAt: new Date().toISOString(),
            stale: false
        };
        try {
            CollaborationService.writeJson(this.lockPath, u338);
            return ResultHelper.ok(u338);
        }
        catch (v338) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `获取工程锁失败: ${v338}`);
        }
    }
    releaseLock(m338: string, n338: string): ApiResult<void> {
        this.lockPath = `${m338}.lock`;
        try {
            if (!fs.accessSync(this.lockPath))
                return ResultHelper.ok();
            const p338 = CollaborationService.readJson(this.lockPath) as ProjectLockInfo;
            if (p338.holderId === n338) {
                fs.unlinkSync(this.lockPath);
            }
            return ResultHelper.ok();
        }
        catch (o338) {
            return ResultHelper.ok();
        }
    }
    getLockInfo(j338: string): ProjectLockInfo | null {
        const k338 = `${j338}.lock`;
        try {
            fs.accessSync(k338);
            return CollaborationService.readJson(k338) as ProjectLockInfo;
        }
        catch (l338) {
            return null;
        }
    }
    clearStaleLock(g338: string): void {
        const h338 = `${g338}.lock`;
        try {
            if (fs.accessSync(h338)) {
                fs.unlinkSync(h338);
            }
        }
        catch (i338) { }
    }
    static computeDiff(h337: SchTopology, i337: SchTopology): TopologySnapshotDiff {
        const j337 = new Set(h337.deviceList.map(f338 => f338.instUuid));
        const k337 = new Set(i337.deviceList.map(e338 => e338.instUuid));
        const l337 = i337.deviceList.filter(d338 => !j337.has(d338.instUuid)).map(c338 => c338.refName);
        const m337 = h337.deviceList.filter(b338 => !k337.has(b338.instUuid)).map(a338 => a338.refName);
        const n337: string[] = [];
        const o337: string[] = [];
        for (const x337 of i337.deviceList) {
            const y337 = h337.deviceList.find(z337 => z337.instUuid === x337.instUuid);
            if (!y337)
                continue;
            if (JSON.stringify(y337.params) !== JSON.stringify(x337.params)) {
                n337.push(x337.refName);
                o337.push(`${x337.refName}:params`);
            }
            if (y337.libDevId !== x337.libDevId || y337.x !== x337.x || y337.y !== x337.y) {
                if (!n337.includes(x337.refName))
                    n337.push(x337.refName);
            }
        }
        const p337 = new Set(h337.netList.map(w337 => w337.netUuid));
        const q337 = new Set(i337.netList.map(v337 => v337.netUuid));
        return {
            baseHash: CollaborationService.topologyHash(h337),
            snapshotHash: CollaborationService.topologyHash(i337),
            addedDevices: l337,
            removedDevices: m337,
            modifiedDevices: n337,
            addedNets: i337.netList.filter(u337 => !p337.has(u337.netUuid)).map(t337 => t337.netName),
            removedNets: h337.netList.filter(s337 => !q337.has(s337.netUuid)).map(r337 => r337.netName),
            modifiedParams: o337,
            wireCountDelta: i337.wireList.length - h337.wireList.length,
            hexConfigChanged: false
        };
    }
    private static topologyHash(a337: SchTopology): string {
        const b337: TopologyDeviceSlim[] = [];
        for (let e337 = 0; e337 < a337.deviceList.length; e337++) {
            const f337 = a337.deviceList[e337];
            const g337: TopologyDeviceSlim = { id: f337.instUuid, lib: f337.libDevId, p: serializeMap(f337.params) };
            b337.push(g337);
        }
        const c337: TopologyHashPayload = {
            devices: b337,
            nets: a337.netList.length,
            wires: a337.wireList.length
        };
        const d337 = mapAwareStringify(c337 as Object);
        return CryptoUtil.hash(d337).substring(0, 16);
    }
    private static filterCategory(v336: TopologySnapshotDiff, w336: string[]): string[] {
        const x336: string[] = [];
        appendStringArray(x336, v336.addedDevices);
        appendStringArray(x336, v336.removedDevices);
        appendStringArray(x336, v336.modifiedDevices);
        return x336.filter(y336 => w336.some(z336 => y336.toUpperCase().includes(z336.toUpperCase())));
    }
    private static buildSummary(r336: TopologySnapshotDiff, s336: string, t336: string): string[] {
        const u336: string[] = [`版本 ${s336} → ${t336}`];
        if (r336.addedDevices.length)
            u336.push(`新增器件: ${r336.addedDevices.join(', ')}`);
        if (r336.removedDevices.length)
            u336.push(`删除器件: ${r336.removedDevices.join(', ')}`);
        if (r336.modifiedDevices.length)
            u336.push(`修改器件: ${r336.modifiedDevices.join(', ')}`);
        if (r336.addedNets.length)
            u336.push(`新增网络: ${r336.addedNets.join(', ')}`);
        if (r336.wireCountDelta !== 0)
            u336.push(`布线变更: ${r336.wireCountDelta > 0 ? '+' : ''}${r336.wireCountDelta} 条`);
        if (u336.length === 1)
            u336.push('无显著拓扑变更');
        return u336;
    }
    private static writeJson(l336: string, m336: TopologySnapshotDiff | ProjectLockInfo): void {
        try {
            const o336 = l336.substring(0, l336.lastIndexOf('/'));
            try {
                fs.mkdirSync(o336, true);
            }
            catch (q336) { }
            const p336 = fs.openSync(l336, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(p336.fd, JSON.stringify(m336, null, 2));
            fs.closeSync(p336);
        }
        catch (n336) {
            throw new Error(`Failed to write file: ${l336}`);
        }
    }
    private static readJson(g336: string): object {
        try {
            const i336 = fs.openSync(g336, fs.OpenMode.READ_ONLY);
            const j336 = fs.statSync(g336);
            const k336 = new ArrayBuffer(j336.size);
            fs.readSync(i336.fd, k336);
            fs.closeSync(i336);
            return JSON.parse(arrayBufferToString(k336)) as object;
        }
        catch (h336) {
            throw new Error(`Failed to read file: ${g336}`);
        }
    }
}
