/**
 * 协作服务：快照 diff、版本对比、工程锁、变更日志
 */
import fs from '@ohos.file.fs';
import {
  SchTopology, CryptoUtil, IdUtil, ApiResult, ResultHelper, ErrCode,
  SnapshotMeta, TopologySnapshotDiff, VersionCompareReport,
  CollabChangeLogEntry, ProjectLockInfo, ProjectAccessMode,
  CollaborationData, FeatureGate, SchematicAnnotation, emptySchTopology,
  mapAwareStringify, serializeMap
} from 'common';
import {
  arrayBufferToString, appendStringArray, copyCollabChangeLogArray,
  copySchematicAnnotationArray, copySnapshotMetaArray, mergeUniqueStrings
} from '../internal/FilePersistenceHelpers';

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

  init(workspaceDir: string): void {
    this.snapshotBaseDir = `${workspaceDir}/collaboration/snapshots`;
    try {
      fs.mkdirSync(this.snapshotBaseDir, true);
    } catch (_e) { /* exists */ }
  }

  loadCollaborationData(data: CollaborationData | undefined): void {
    this.snapshots = data !== undefined && data.snapshots !== undefined
      ? copySnapshotMetaArray(data.snapshots) : [];
    this.changeLog = data !== undefined && data.changeLog !== undefined
      ? copyCollabChangeLogArray(data.changeLog) : [];
  }

  exportCollaborationData(annotations: SchematicAnnotation[]): CollaborationData {
    return {
      annotations: copySchematicAnnotationArray(annotations),
      snapshots: copySnapshotMetaArray(this.snapshots),
      changeLog: copyCollabChangeLogArray(this.changeLog)
    };
  }

  createSnapshot(
    versionLabel: string,
    note: string,
    topo: SchTopology,
    author: string,
    baseTopo?: SchTopology
  ): ApiResult<SnapshotMeta> {
    const gate = FeatureGate.canUseVersionCompare();
    if (!gate.success) {
      return ResultHelper.fail(gate.errCode ?? ErrCode.ERR_FEATURE_LOCKED, gate.error);
    }
    const hash = CollaborationService.topologyHash(topo);
    const id = `snap_${Date.now()}`;
    const diffPath = `${this.snapshotBaseDir}/${id}.diff.json`;
    const diff = baseTopo
      ? CollaborationService.computeDiff(baseTopo, topo)
      : CollaborationService.computeDiff(emptySchTopology(), topo);
    diff.baseHash = baseTopo ? CollaborationService.topologyHash(baseTopo) : '';
    diff.snapshotHash = hash;
    try {
      CollaborationService.writeJson(diffPath, diff);
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_PERMISSION, `快照保存失败: ${e}`);
    }
    const meta: SnapshotMeta = {
      id,
      versionLabel,
      note,
      timestamp: new Date().toISOString(),
      topologyHash: hash,
      diffFilePath: diffPath,
      author
    };
    this.snapshots.push(meta);
    this.appendChangeLog(author, 'snapshot', versionLabel, note);
    return ResultHelper.ok(meta);
  }

  listSnapshots(): SnapshotMeta[] {
    return copySnapshotMetaArray(this.snapshots);
  }

  compareTopologies(from: SchTopology, to: SchTopology): TopologySnapshotDiff {
    return CollaborationService.computeDiff(from, to);
  }

  compareSnapshots(fromId: string, toId: string, _currentTopo: SchTopology): ApiResult<VersionCompareReport> {
    const gate = FeatureGate.canUseVersionCompare();
    if (!gate.success) {
      return ResultHelper.fail(gate.errCode ?? ErrCode.ERR_FEATURE_LOCKED, gate.error);
    }
    const fromSnap = this.snapshots.find(s => s.id === fromId);
    const toSnap = this.snapshots.find(s => s.id === toId);
    if (!fromSnap || !toSnap) {
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '快照不存在');
    }
    let fromDiff: TopologySnapshotDiff;
    let toDiff: TopologySnapshotDiff;
    try {
      fromDiff = CollaborationService.readJson(fromSnap.diffFilePath) as TopologySnapshotDiff;
      toDiff = CollaborationService.readJson(toSnap.diffFilePath) as TopologySnapshotDiff;
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `读取快照 diff 失败: ${e}`);
    }
    const merged: TopologySnapshotDiff = {
      baseHash: fromSnap.topologyHash,
      snapshotHash: toSnap.topologyHash,
      addedDevices: toDiff.addedDevices.filter(d => !fromDiff.addedDevices.includes(d)),
      removedDevices: mergeUniqueStrings(fromDiff.removedDevices, toDiff.removedDevices),
      modifiedDevices: mergeUniqueStrings(fromDiff.modifiedDevices, toDiff.modifiedDevices),
      addedNets: mergeUniqueStrings(fromDiff.addedNets, toDiff.addedNets),
      removedNets: mergeUniqueStrings(fromDiff.removedNets, toDiff.removedNets),
      modifiedParams: mergeUniqueStrings(fromDiff.modifiedParams, toDiff.modifiedParams),
      wireCountDelta: toDiff.wireCountDelta - fromDiff.wireCountDelta,
      hexConfigChanged: fromDiff.hexConfigChanged || toDiff.hexConfigChanged
    };
    const report: VersionCompareReport = {
      fromSnapshotId: fromId,
      toSnapshotId: toId,
      diff: merged,
      powerChanges: CollaborationService.filterCategory(merged, ['VCC', 'VDD', 'GND', 'POWER']),
      mcuChanges: CollaborationService.filterCategory(merged, ['STM32', 'AT89', 'STC', 'MCU']),
      peripheralChanges: CollaborationService.filterCategory(merged, ['LCD', 'OLED', 'RELAY', 'SW_']),
      summaryLines: CollaborationService.buildSummary(merged, fromSnap.versionLabel, toSnap.versionLabel)
    };
    return ResultHelper.ok(report);
  }

  appendChangeLog(user: string, action: string, target: string, detail: string): CollabChangeLogEntry {
    const entry: CollabChangeLogEntry = {
      id: IdUtil.generate('log'),
      timestamp: new Date().toISOString(),
      user,
      action,
      target,
      detail
    };
    this.changeLog.push(entry);
    if (this.changeLog.length > 5000) {
      this.changeLog = this.changeLog.slice(-5000);
    }
    return entry;
  }

  getChangeLog(): CollabChangeLogEntry[] {
    return copyCollabChangeLogArray(this.changeLog);
  }

  acquireLock(projectPath: string, holderId: string, holderName: string,
    mode: ProjectAccessMode): ApiResult<ProjectLockInfo> {
    this.lockPath = `${projectPath}.lock`;
    try {
      if (fs.accessSync(this.lockPath)) {
        const existing = CollaborationService.readJson(this.lockPath) as ProjectLockInfo;
        if (!existing.stale && existing.holderId !== holderId) {
          return ResultHelper.fail(
            ErrCode.ERR_PROJECT_LOCKED,
            `工程已被 ${existing.holderName} 以${existing.mode === 'editable' ? '编辑' : '只读'}模式打开`
          );
        }
      }
    } catch (_e) { /* no lock */ }
    const lock: ProjectLockInfo = {
      projectPath,
      holderId,
      holderName,
      mode,
      acquiredAt: new Date().toISOString(),
      stale: false
    };
    try {
      CollaborationService.writeJson(this.lockPath, lock);
      return ResultHelper.ok(lock);
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_PERMISSION, `获取工程锁失败: ${e}`);
    }
  }

  releaseLock(projectPath: string, holderId: string): ApiResult<void> {
    this.lockPath = `${projectPath}.lock`;
    try {
      if (!fs.accessSync(this.lockPath)) return ResultHelper.ok();
      const existing = CollaborationService.readJson(this.lockPath) as ProjectLockInfo;
      if (existing.holderId === holderId) {
        fs.unlinkSync(this.lockPath);
      }
      return ResultHelper.ok();
    } catch (_e) {
      return ResultHelper.ok();
    }
  }

  getLockInfo(projectPath: string): ProjectLockInfo | null {
    const path = `${projectPath}.lock`;
    try {
      fs.accessSync(path);
      return CollaborationService.readJson(path) as ProjectLockInfo;
    } catch (_e) {
      return null;
    }
  }

  clearStaleLock(projectPath: string): void {
    const path = `${projectPath}.lock`;
    try {
      if (fs.accessSync(path)) {
        fs.unlinkSync(path);
      }
    } catch (_e) { /* ignore */ }
  }

  static computeDiff(from: SchTopology, to: SchTopology): TopologySnapshotDiff {
    const fromDevIds = new Set(from.deviceList.map(d => d.instUuid));
    const toDevIds = new Set(to.deviceList.map(d => d.instUuid));
    const addedDevices = to.deviceList.filter(d => !fromDevIds.has(d.instUuid)).map(d => d.refName);
    const removedDevices = from.deviceList.filter(d => !toDevIds.has(d.instUuid)).map(d => d.refName);
    const modifiedDevices: string[] = [];
    const modifiedParams: string[] = [];
    for (const dev of to.deviceList) {
      const orig = from.deviceList.find(d => d.instUuid === dev.instUuid);
      if (!orig) continue;
      if (JSON.stringify(orig.params) !== JSON.stringify(dev.params)) {
        modifiedDevices.push(dev.refName);
        modifiedParams.push(`${dev.refName}:params`);
      }
      if (orig.libDevId !== dev.libDevId || orig.x !== dev.x || orig.y !== dev.y) {
        if (!modifiedDevices.includes(dev.refName)) modifiedDevices.push(dev.refName);
      }
    }
    const fromNetIds = new Set(from.netList.map(n => n.netUuid));
    const toNetIds = new Set(to.netList.map(n => n.netUuid));
    return {
      baseHash: CollaborationService.topologyHash(from),
      snapshotHash: CollaborationService.topologyHash(to),
      addedDevices,
      removedDevices,
      modifiedDevices,
      addedNets: to.netList.filter(n => !fromNetIds.has(n.netUuid)).map(n => n.netName),
      removedNets: from.netList.filter(n => !toNetIds.has(n.netUuid)).map(n => n.netName),
      modifiedParams,
      wireCountDelta: to.wireList.length - from.wireList.length,
      hexConfigChanged: false
    };
  }

  private static topologyHash(topo: SchTopology): string {
    const devices: TopologyDeviceSlim[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const entry: TopologyDeviceSlim = { id: d.instUuid, lib: d.libDevId, p: serializeMap(d.params) };
      devices.push(entry);
    }
    const payload: TopologyHashPayload = {
      devices: devices,
      nets: topo.netList.length,
      wires: topo.wireList.length
    };
    const slim = mapAwareStringify(payload as Object);
    return CryptoUtil.hash(slim).substring(0, 16);
  }

  private static filterCategory(diff: TopologySnapshotDiff, keywords: string[]): string[] {
    const all: string[] = [];
    appendStringArray(all, diff.addedDevices);
    appendStringArray(all, diff.removedDevices);
    appendStringArray(all, diff.modifiedDevices);
    return all.filter(name => keywords.some(k => name.toUpperCase().includes(k.toUpperCase())));
  }

  private static buildSummary(diff: TopologySnapshotDiff, fromLabel: string, toLabel: string): string[] {
    const lines: string[] = [`版本 ${fromLabel} → ${toLabel}`];
    if (diff.addedDevices.length) lines.push(`新增器件: ${diff.addedDevices.join(', ')}`);
    if (diff.removedDevices.length) lines.push(`删除器件: ${diff.removedDevices.join(', ')}`);
    if (diff.modifiedDevices.length) lines.push(`修改器件: ${diff.modifiedDevices.join(', ')}`);
    if (diff.addedNets.length) lines.push(`新增网络: ${diff.addedNets.join(', ')}`);
    if (diff.wireCountDelta !== 0) lines.push(`布线变更: ${diff.wireCountDelta > 0 ? '+' : ''}${diff.wireCountDelta} 条`);
    if (lines.length === 1) lines.push('无显著拓扑变更');
    return lines;
  }

  private static writeJson(path: string, data: TopologySnapshotDiff | ProjectLockInfo): void {
    try {
      const dir = path.substring(0, path.lastIndexOf('/'));
      try { fs.mkdirSync(dir, true); } catch (_e) { /* */ }
      const fileHandle = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(fileHandle.fd, JSON.stringify(data, null, 2));
      fs.closeSync(fileHandle);
    } catch (e) {
      throw new Error(`Failed to write file: ${path}`);
    }
  }

  private static readJson(path: string): object {
    try {
      const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(path);
      const buffer = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buffer);
      fs.closeSync(fileHandle);
      return JSON.parse(arrayBufferToString(buffer)) as object;
    } catch (e) {
      throw new Error(`Failed to read file: ${path}`);
    }
  }
}

