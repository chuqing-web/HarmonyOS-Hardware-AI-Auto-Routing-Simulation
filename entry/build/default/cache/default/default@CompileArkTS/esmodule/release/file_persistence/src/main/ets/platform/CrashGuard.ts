import { ResultHelper, ErrCode, Logger, CryptoUtil, mapAwareStringify } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectSnapshot, VersionDiff, ChangeLogEntry, SchTopology, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import fs from "@ohos:file.fs";
import { copyChangeLogEntryArray, copyProjectSnapshotArray } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
export class CrashGuard {
    private snapshotIntervalMs: number = 60000;
    private timerId: number = -1;
    private snapshotCallback: (() => SchTopology | null) | null = null;
    enable(y365: number, z365: () => SchTopology | null): void {
        this.disable();
        this.snapshotIntervalMs = y365;
        this.snapshotCallback = z365;
        this.timerId = setInterval(() => this.saveMemorySnapshot(), y365);
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
        const u365 = this.snapshotCallback();
        if (!u365)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        try {
            const w365 = 'crash_guard/latest_snapshot.json';
            const x365 = fs.openSync(w365, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(x365.fd, mapAwareStringify(u365 as Object));
            fs.closeSync(x365);
            return ResultHelper.ok();
        }
        catch (v365) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `${v365}`);
        }
    }
    clearSensitiveData(s365: string[]): void {
        for (let t365 = 0; t365 < s365.length; t365++)
            s365[t365] = '';
        Logger.info('CrashGuard', '已清空内存中的 API 密钥');
    }
}
export class VersionManager {
    private snapshots: ProjectSnapshot[] = [];
    private changeLog: ChangeLogEntry[] = [];
    createSnapshot(n365: string, o365: string, p365: SchTopology, q365: string): ProjectSnapshot {
        const r365: ProjectSnapshot = {
            id: `snap_${Date.now()}`,
            name: n365,
            note: o365,
            timestamp: new Date().toISOString(),
            topologyHash: CryptoUtil.encrypt(JSON.stringify(p365).substring(0, 100)),
            dataPath: q365
        };
        this.snapshots.push(r365);
        return r365;
    }
    listSnapshots(): ProjectSnapshot[] { return copyProjectSnapshotArray(this.snapshots); }
    compare(w364: SchTopology, x364: SchTopology): VersionDiff {
        const y364 = new Set(w364.deviceList.map(m365 => m365.instUuid));
        const z364 = new Set(x364.deviceList.map(l365 => l365.instUuid));
        return {
            addedDevices: x364.deviceList.filter(k365 => !y364.has(k365.instUuid)).map(j365 => j365.refName),
            removedDevices: w364.deviceList.filter(i365 => !z364.has(i365.instUuid)).map(h365 => h365.refName),
            modifiedDevices: x364.deviceList.filter(e365 => {
                const f365 = w364.deviceList.find(g365 => g365.instUuid === e365.instUuid);
                return f365 && JSON.stringify(f365.params) !== JSON.stringify(e365.params);
            }).map(d365 => d365.refName),
            addedNets: x364.netList.filter(b365 => !w364.netList.some(c365 => c365.netUuid === b365.netUuid)).map(a365 => a365.netName),
            removedWires: Math.max(0, w364.wireList.length - x364.wireList.length)
        };
    }
    logChange(s364: string, t364: string, u364: string, v364: string): void {
        this.changeLog.push({
            timestamp: new Date().toISOString(),
            user: s364,
            action: t364,
            target: u364,
            detail: v364
        });
    }
    getChangeLog(): ChangeLogEntry[] { return copyChangeLogEntryArray(this.changeLog); }
    checkFileIntegrity(q364: string, r364: string): boolean {
        return CryptoUtil.encrypt(q364) === r364 || r364.length === 0;
    }
}
