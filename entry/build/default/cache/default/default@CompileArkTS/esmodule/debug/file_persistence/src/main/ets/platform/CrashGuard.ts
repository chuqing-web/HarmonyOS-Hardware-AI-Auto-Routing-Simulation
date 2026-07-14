import { ResultHelper, ErrCode, Logger, CryptoUtil, mapAwareStringify } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectSnapshot, VersionDiff, ChangeLogEntry, SchTopology, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import fs from "@ohos:file.fs";
import { copyChangeLogEntryArray, copyProjectSnapshotArray } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
export class CrashGuard {
    private snapshotIntervalMs: number = 60000;
    private timerId: number = -1;
    private snapshotCallback: (() => SchTopology | null) | null = null;
    enable(intervalMs: number, callback: () => SchTopology | null): void {
        this.disable();
        this.snapshotIntervalMs = intervalMs;
        this.snapshotCallback = callback;
        this.timerId = setInterval(() => this.saveMemorySnapshot(), intervalMs);
    }
    disable(): void {
        if (this.timerId >= 0) {
            clearInterval(this.timerId);
            this.timerId = -1;
        }
    }
    async saveMemorySnapshot(): Promise<ApiResult<void>> {
        if (!this.snapshotCallback)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        const topo = this.snapshotCallback();
        if (!topo)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        try {
            const path = 'crash_guard/latest_snapshot.json';
            const fileHandle = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(fileHandle.fd, mapAwareStringify(topo as Object));
            fs.closeSync(fileHandle);
            return ResultHelper.ok();
        }
        catch (e) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `${e}`);
        }
    }
    clearSensitiveData(apiKeys: string[]): void {
        for (let i = 0; i < apiKeys.length; i++)
            apiKeys[i] = '';
        Logger.info('CrashGuard', '已清空内存中的 API 密钥');
    }
}
export class VersionManager {
    private snapshots: ProjectSnapshot[] = [];
    private changeLog: ChangeLogEntry[] = [];
    createSnapshot(name: string, note: string, topo: SchTopology, dataPath: string): ProjectSnapshot {
        const snap: ProjectSnapshot = {
            id: `snap_${Date.now()}`,
            name,
            note,
            timestamp: new Date().toISOString(),
            topologyHash: CryptoUtil.encrypt(JSON.stringify(topo).substring(0, 100)),
            dataPath
        };
        this.snapshots.push(snap);
        return snap;
    }
    listSnapshots(): ProjectSnapshot[] { return copyProjectSnapshotArray(this.snapshots); }
    compare(a: SchTopology, b: SchTopology): VersionDiff {
        const aIds = new Set(a.deviceList.map(d => d.instUuid));
        const bIds = new Set(b.deviceList.map(d => d.instUuid));
        return {
            addedDevices: b.deviceList.filter(d => !aIds.has(d.instUuid)).map(d => d.refName),
            removedDevices: a.deviceList.filter(d => !bIds.has(d.instUuid)).map(d => d.refName),
            modifiedDevices: b.deviceList.filter(d => {
                const orig = a.deviceList.find(o => o.instUuid === d.instUuid);
                return orig && JSON.stringify(orig.params) !== JSON.stringify(d.params);
            }).map(d => d.refName),
            addedNets: b.netList.filter(n => !a.netList.some(o => o.netUuid === n.netUuid)).map(n => n.netName),
            removedWires: Math.max(0, a.wireList.length - b.wireList.length)
        };
    }
    logChange(user: string, action: string, target: string, detail: string): void {
        this.changeLog.push({
            timestamp: new Date().toISOString(), user, action, target, detail
        });
    }
    getChangeLog(): ChangeLogEntry[] { return copyChangeLogEntryArray(this.changeLog); }
    checkFileIntegrity(header: string, expectedHash: string): boolean {
        return CryptoUtil.encrypt(header) === expectedHash || expectedHash.length === 0;
    }
}
