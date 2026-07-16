/**
 * 模块7：文件持久化完整实现
 */
import { IFilePersistence, ProjectData, FileHeaderInfo } from './api/IFilePersistence';
import { ProteusParser } from './parsers/ProteusParser';
import { KiCadParser } from './parsers/KiCadParser';
import { LtspiceParser } from './parsers/LtspiceParser';
import { formatImportReport } from './parsers/ImportReport';
import { CollaborationService } from './collaboration/CollaborationService';
import {
  ProjectFile, SchematicDocument, FileFormat, Result,
  SimulationConfig, SimulationMode, EventBus, ModuleEvent, CryptoUtil,
  SchTopology, SimConfig, WaveData, AiApiConfig,
  ProgressCallback, ApiResult, ErrCode, ResultHelper, Validate,
  TopologyAdapter, defaultSimConfig, makeProgress,
  SnapshotMeta, VersionCompareReport, CollabChangeLogEntry,
  ProjectLockInfo, ProjectAccessMode, CollaborationData, SchematicAnnotation, paramMapGet,
  mapAwareStringify, mapAwareParse, errCodeMessage
} from 'common';
import fs from '@ohos.file.fs';
import {
  arrayBufferToString, buildProjectDataForSave, encryptAiApiConfigs,
  encryptAiApiConfigsForSave, copyStringArray, maxOfNumbers
} from './internal/FilePersistenceHelpers';
import { TopoPngExporter } from './export/TopoPngExporter';
import { TopoSvgExporter } from './export/TopoSvgExporter';
import { TopoPdfExporter } from './export/TopoPdfExporter';
import { buildBomCsv, BomLookup } from './internal/BomExportHelper';

const SCHSIM_VERSION = '2.0.0';
const RECENT_MAX = 10;
const RECOVERY_DIR = 'schsim_recovery';

interface FilePathEventData {
  path: string;
}

interface ProjectLockReleaseData {
  released: boolean;
  projectPath: string;
}

export interface SessionState {
  lastPath: string;
  lastProjectName: string;
  closedCleanly: boolean;
  timestamp: string;
}

export class FilePersistenceImpl implements IFilePersistence {
  private recentFiles: string[] = [];
  private autoSaveTimer: number = -1;
  private autoSavePath: string = '';
  private autoSaveCallback: (() => ProjectFile | null) | null = null;
  private autoBackupTimer: number = -1;
  private autoBackupDir: string = '';
  private autoBackupCallback: (() => ProjectData | null) | null = null;
  private collaboration: CollaborationService = new CollaborationService();
  private lastTopologyForSnapshot: SchTopology | null = null;
  private sectionHashes: Map<string, string> = new Map();
  private bomLookup: BomLookup | null = null;
  private appBaseDir: string = '';

  // ---- v2 API ----

  async saveProjectData(data: ProjectData, path: string): Promise<ApiResult<void>> {
    const pathErr = Validate.filePath(path);
    if (pathErr !== null) return ResultHelper.fail(pathErr);
    try {
      const topoHash = CryptoUtil.sha256(mapAwareStringify(data.topology as Object)).substring(0, 16);
      const simHash = CryptoUtil.sha256(mapAwareStringify(data.simConfig as Object)).substring(0, 16);
      const aiHash = CryptoUtil.sha256(mapAwareStringify(data.aiConfigs as Object)).substring(0, 16);
      const prevTopo = this.sectionHashes.get(`${path}:topology`) ?? '';
      const prevSim = this.sectionHashes.get(`${path}:simConfig`) ?? '';
      const prevAi = this.sectionHashes.get(`${path}:aiConfigs`) ?? '';
      const onlyMetaChanged = prevTopo === topoHash && prevSim === simHash && prevAi === aiHash;

      let merged = data;
      if (onlyMetaChanged) {
        try {
          fs.accessSync(path);
          const existingJson = await this.readFileText(path);
          const existing = mapAwareParse<ProjectData>(existingJson);
          existing.modifiedAt = data.modifiedAt;
          existing.name = data.name;
          // 必须用内存明文 aiConfigs，勿沿用磁盘密文（否则二次加密导致下次读不到）
          existing.aiConfigs = data.aiConfigs;
          merged = existing;
        } catch (_e) { /* full save */ }
      }

      const toSave = buildProjectDataForSave(
        merged,
        SCHSIM_VERSION,
        new Date().toISOString(),
        this.collaboration.exportCollaborationData([]),
        encryptAiApiConfigsForSave(merged.aiConfigs)
      );
      toSave.integrityHash = CryptoUtil.sha256(FilePersistenceImpl.buildHashPayload(toSave));
      const json = mapAwareStringify(toSave as Object, true);
      await this.writeTextFile(path, json);
      this.sectionHashes.set(`${path}:topology`, topoHash);
      this.sectionHashes.set(`${path}:simConfig`, simHash);
      this.sectionHashes.set(`${path}:aiConfigs`, aiHash);
      this.addRecentFile(path);
      const savedData: FilePathEventData = { path: path };
      EventBus.getInstance().publish({
        event: ModuleEvent.FILE_SAVED,
        source: 'file_persistence',
        timestamp: Date.now(),
        data: savedData
      });
      return ResultHelper.ok();
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Save failed: ${e}`);
    }
  }

  async loadProjectData(path: string): Promise<ApiResult<ProjectData>> {
    const pathErr = Validate.filePath(path);
    if (pathErr !== null) return ResultHelper.fail(pathErr);
    try {
      const json = await this.readFileText(path);
      const header = this.parseHeader(json);
      if (!header.isValid) {
        const repaired = await this.repairCorruptProject(path);
        if (repaired.success && repaired.data) return repaired;
        return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, 'Invalid project file');
      }
      const data = mapAwareParse<ProjectData>(json);
      if (data.integrityHash) {
        const expected = data.integrityHash;
        const payloadForHash = FilePersistenceImpl.buildHashPayload(data);
        const computed = CryptoUtil.sha256(payloadForHash);
        if (computed !== expected) {
          const repaired = await this.repairCorruptProject(path);
          if (repaired.success && repaired.data) {
            return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT,
              `${errCodeMessage(ErrCode.ERR_FILE_CORRUPT)} — 已尝试恢复，请验证内容`);
          }
          return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT,
            '文件已损坏或被篡改，校验码不匹配');
        }
      }
      this.decryptAiConfigs(data.aiConfigs);
      this.normalizeProjectData(data);
      this.collaboration.loadCollaborationData(data.collaboration);
      this.lastTopologyForSnapshot = data.topology;
      this.addRecentFile(path);
      const loadedData: FilePathEventData = { path: path };
      EventBus.getInstance().publish({
        event: ModuleEvent.FILE_LOADED,
        source: 'file_persistence',
        timestamp: Date.now(),
        data: loadedData
      });
      return ResultHelper.ok(data);
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `Load failed: ${e}`);
    }
  }

  enableAutoBackup(intervalMs: number, backupDir: string, getData: () => ProjectData | null): void {
    this.disableAutoBackup();
    this.autoBackupDir = backupDir;
    this.autoBackupCallback = getData;
    this.autoBackupTimer = setInterval(async () => {
      if (this.autoBackupCallback && this.autoBackupDir) {
        const data = this.autoBackupCallback();
        if (data) {
          const backupPath = `${this.autoBackupDir}/backup_${data.name}_${Date.now()}.schsim`;
          await this.saveProjectData(data, backupPath);
        }
      }
    }, intervalMs);
  }

  disableAutoBackup(): void {
    if (this.autoBackupTimer >= 0) {
      clearInterval(this.autoBackupTimer);
      this.autoBackupTimer = -1;
    }
  }

  async restoreFromBackup(projectName: string): Promise<ApiResult<ProjectData>> {
    try {
      const dir = this.autoBackupDir || RECOVERY_DIR;
      const list = fs.listFileSync(dir);
      const backups = list
        .filter(f => f.startsWith(`backup_${projectName}_`) && f.endsWith('.schsim'))
        .sort()
        .reverse();
      if (backups.length === 0) {
        return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, 'No backup found');
      }
      return this.loadProjectData(`${dir}/${backups[0]}`);
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `Restore failed: ${e}`);
    }
  }

  async importProteusSch(path: string, onProgress?: ProgressCallback): Promise<ApiResult<SchTopology>> {
    const pathErr = Validate.filePath(path);
    if (pathErr !== null) return ResultHelper.fail(pathErr);
    onProgress?.(makeProgress(10, 'Reading Proteus schematic'));
    try {
      const content = await this.readFileText(path);
      onProgress?.(makeProgress(50, 'Parsing schematic'));
      const report = ProteusParser.parse(content, path);
      const topo = TopologyAdapter.toTopology(report.doc);
      topo.schName = report.doc.name;
      onProgress?.(makeProgress(90, formatImportReport(report)));
      onProgress?.(makeProgress(100, 'Import complete', true));
      return ResultHelper.ok(topo);
    } catch (e) {
      onProgress?.(makeProgress(100, 'Import failed', true, ErrCode.ERR_FILE_CORRUPT, `${e}`));
      return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `Proteus import failed: ${e}`);
    }
  }

  async exportSchImage(topo: SchTopology, path: string, format: 'png' | 'svg' = 'png'): Promise<ApiResult<void>> {
    const pathErr = Validate.filePath(path);
    if (pathErr !== null) return ResultHelper.fail(pathErr);
    try {
      const svg = TopoSvgExporter.export(topo);
      if (format === 'svg') {
        const result = await this.writeTextFile(path, svg);
        return result.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, result.error);
      }
      const pngPath = path.endsWith('.png') ? path : `${path}.png`;
      const pngBytes = TopoPngExporter.export(topo);
      const binResult = await this.writeBinaryFile(pngPath, pngBytes);
      return binResult.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, binResult.error);
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Image export failed: ${e}`);
    }
  }

  async exportWaveCsv(waves: WaveData[], path: string): Promise<ApiResult<void>> {
    const pathErr = Validate.filePath(path);
    if (pathErr !== null) return ResultHelper.fail(pathErr);
    let csv = 'time';
    for (const w of waves) csv += `,${w.probeName}_V,${w.probeName}_I`;
    csv += '\n';
    const axisLengths: number[] = [];
    for (let wi = 0; wi < waves.length; wi++) {
      axisLengths.push(waves[wi].timeAxis.length);
    }
    const maxLen = maxOfNumbers(axisLengths);
    for (let i = 0; i < maxLen; i++) {
      const t = waves[0]?.timeAxis[i] ?? i;
      csv += `${t}`;
      for (const w of waves) {
        csv += `,${w.voltageAxis[i] ?? ''},${w.currentAxis[i] ?? ''}`;
      }
      csv += '\n';
    }
    const result = await this.writeTextFile(path, csv);
    return result.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, result.error);
  }

  async saveAiApiConfig(configs: AiApiConfig[], path: string): Promise<ApiResult<void>> {
    const encrypted = encryptAiApiConfigs(configs);
    const result = await this.writeTextFile(path, JSON.stringify(encrypted, null, 2));
    return result.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, result.error);
  }

  async loadAiApiConfig(path: string): Promise<ApiResult<AiApiConfig[]>> {
    try {
      const json = await this.readFileText(path);
      const configs = JSON.parse(json) as AiApiConfig[];
      this.decryptAiConfigs(configs);
      return ResultHelper.ok(configs);
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `Load AI config failed: ${e}`);
    }
  }

  async checkFileHeader(path: string): Promise<ApiResult<FileHeaderInfo>> {
    try {
      const json = await this.readFileText(path);
      return ResultHelper.ok(this.parseHeader(json));
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `${e}`);
    }
  }

  async repairCorruptProject(path: string): Promise<ApiResult<ProjectData>> {
    try {
      let json = await this.readFileText(path);
      json = json.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const parsed: object = JSON.parse(json) as object;
      const dict = parsed as Record<string, Object>;
      const now = new Date().toISOString();
      let data: ProjectData;
      if (dict['topology'] !== undefined) {
        data = parsed as ProjectData;
      } else if (dict['schematic'] !== undefined) {
        const file = parsed as ProjectFile;
        data = {
          version: file.version ?? SCHSIM_VERSION,
          name: file.name,
          topology: TopologyAdapter.toTopology(file.schematic),
          simConfig: this.legacyToSimConfig(file.simulationConfig),
          aiConfigs: file.aiConfigs ?? [],
          createdAt: file.createdAt ?? now,
          modifiedAt: now
        };
      } else {
        return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, 'Unrecoverable format');
      }
      data.version = SCHSIM_VERSION;
      data.modifiedAt = now;
      this.normalizeProjectData(data);
      await this.saveProjectData(data, path);
      return ResultHelper.ok(data);
    } catch (e) {
      return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `Repair failed: ${e}`);
    }
  }

  initCollaboration(workspaceDir: string): void {
    this.collaboration.init(workspaceDir);
  }

  async createProjectSnapshot(
    versionLabel: string,
    note: string,
    topo: SchTopology,
    author: string
  ): Promise<ApiResult<SnapshotMeta>> {
    const base = this.lastTopologyForSnapshot ?? undefined;
    const result = this.collaboration.createSnapshot(versionLabel, note, topo, author, base);
    if (result.success && result.data !== undefined) {
      this.lastTopologyForSnapshot = topo;
      EventBus.getInstance().publish({
        event: ModuleEvent.SNAPSHOT_CREATED,
        source: 'file_persistence',
        timestamp: Date.now(),
        data: result.data
      });
    }
    return result;
  }

  listProjectSnapshots(): SnapshotMeta[] {
    return this.collaboration.listSnapshots();
  }

  compareProjectSnapshots(fromId: string, toId: string, topo: SchTopology): ApiResult<VersionCompareReport> {
    return this.collaboration.compareSnapshots(fromId, toId, topo);
  }

  getProjectChangeLog(): CollabChangeLogEntry[] {
    return this.collaboration.getChangeLog();
  }

  appendProjectChangeLog(user: string, action: string, target: string, detail: string): CollabChangeLogEntry {
    return this.collaboration.appendChangeLog(user, action, target, detail);
  }

  acquireProjectLock(
    projectPath: string,
    holderId: string,
    holderName: string,
    mode: ProjectAccessMode
  ): ApiResult<ProjectLockInfo> {
    const result = this.collaboration.acquireLock(projectPath, holderId, holderName, mode);
    if (result.success && result.data !== undefined) {
      EventBus.getInstance().publish({
        event: ModuleEvent.PROJECT_LOCK_CHANGED,
        source: 'file_persistence',
        timestamp: Date.now(),
        data: result.data
      });
    }
    return result;
  }

  releaseProjectLock(projectPath: string, holderId: string): ApiResult<void> {
    const result = this.collaboration.releaseLock(projectPath, holderId);
    const releaseData: ProjectLockReleaseData = { released: true, projectPath: projectPath };
    EventBus.getInstance().publish({
      event: ModuleEvent.PROJECT_LOCK_CHANGED,
      source: 'file_persistence',
      timestamp: Date.now(),
      data: releaseData
    });
    return result;
  }

  getProjectLockInfo(projectPath: string): ProjectLockInfo | null {
    return this.collaboration.getLockInfo(projectPath);
  }

  clearStaleProjectLock(projectPath: string): void {
    this.collaboration.clearStaleLock(projectPath);
  }

  buildCollaborationBundle(annotations: SchematicAnnotation[]): CollaborationData {
    return this.collaboration.exportCollaborationData(annotations);
  }

  // ---- v1 兼容 ----

  async saveProject(file: ProjectFile, path: string): Promise<Result<void>> {
    const data: ProjectData = {
      version: file.version,
      name: file.name,
      topology: TopologyAdapter.toTopology(file.schematic),
      simConfig: this.legacyToSimConfig(file.simulationConfig),
      aiConfigs: file.aiConfigs,
      createdAt: file.createdAt,
      modifiedAt: file.modifiedAt,
      collaboration: file.collaboration ?? this.collaboration.exportCollaborationData([])
    };
    const result = await this.saveProjectData(data, path);
    return { success: result.success, errCode: result.errCode, error: result.error };
  }

  async loadProject(path: string): Promise<Result<ProjectFile>> {
    const result = await this.loadProjectData(path);
    if (!result.success || !result.data) {
      return { success: false, errCode: result.errCode, error: result.error };
    }
    const file = this.projectDataToLegacy(result.data);
    return { success: true, errCode: ErrCode.OK, data: file };
  }

  createNewProject(name: string): ProjectFile {
    const now = new Date().toISOString();
    return {
      version: SCHSIM_VERSION,
      name,
      schematic: {
        id: `sch_${Date.now()}`, name, version: '2.0',
        components: [], wires: [], nets: [], netLabels: [], subcircuits: [],
        metadata: {
          author: '', createdAt: now, modifiedAt: now,
          description: '', gridSize: 10, units: 'mm', undoLimit: 1000
        }
      },
      simulationConfig: {
        mode: SimulationMode.MIXED, startTime: 0, stopTime: 0.001,
        stepSize: 1e-6, maxStep: 1e-5, temperature: 27, convergence: 1e-6,
        mcuClockHz: 11059200
      },
      aiConfigs: [],
      createdAt: now,
      modifiedAt: now,
      collaboration: { annotations: [], snapshots: [], changeLog: [] }
    };
  }

  async importSchematic(path: string, format: FileFormat): Promise<Result<SchematicDocument>> {
    try {
      const content = await this.readFileText(path);
      switch (format) {
        case FileFormat.PROTEUS_SCH: {
          const topoResult = await this.importProteusSch(path);
          if (!topoResult.success || !topoResult.data) {
            return { success: false, errCode: topoResult.errCode, error: topoResult.error };
          }
          return { success: true, errCode: ErrCode.OK, data: TopologyAdapter.fromTopology(topoResult.data) };
        }
        case FileFormat.KICAD:
          return { success: true, errCode: ErrCode.OK, data: this.parseKiCadBasic(content, path) };
        case FileFormat.LTSPICE:
          return { success: true, errCode: ErrCode.OK, data: this.parseLtspiceBasic(content, path) };
        default:
          return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Unsupported format: ${format}` };
      }
    } catch (e) {
      return { success: false, errCode: ErrCode.ERR_FILE_NOT_FOUND, error: `Import failed: ${e}` };
    }
  }

  async exportSchematic(doc: SchematicDocument, path: string, format: FileFormat): Promise<Result<void>> {
    if (format === FileFormat.SCHSIM) {
      const project = this.createNewProject(doc.name);
      project.schematic = doc;
      return this.saveProject(project, path);
    }
    if (format === FileFormat.NETLIST) return this.exportNetlist(doc, path);
    if (format === FileFormat.BOM) return this.exportBom(doc, path);
    return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Export format ${format} not yet implemented` };
  }

  async exportNetlist(doc: SchematicDocument, path: string): Promise<Result<void>> {
    let netlist = `* AI-SCH SPICE Netlist\n* ${doc.name}\n\n`;
    let rNum = 1;
    for (const comp of doc.components) {
      const val = paramMapGet(comp.parameters, 'value', '');
      if (comp.libraryId.startsWith('R_')) {
        netlist += `R${rNum} ${comp.refDes}_1 ${comp.refDes}_2 ${val || comp.libraryId.replace('R_', '')}\n`;
        rNum++;
      } else {
        netlist += `* ${comp.refDes}: ${comp.libraryId}\n`;
      }
    }
    netlist += `\n.end\n`;
    const result = await this.writeTextFile(path, netlist);
    return { success: result.success, errCode: result.success ? ErrCode.OK : ErrCode.ERR_PERMISSION, error: result.error };
  }

  async exportBom(doc: SchematicDocument, path: string): Promise<Result<void>> {
    const csv = buildBomCsv(doc, this.bomLookup ?? undefined);
    const result = await this.writeTextFile(path, csv);
    return { success: result.success, errCode: result.success ? ErrCode.OK : ErrCode.ERR_PERMISSION, error: result.error };
  }

  setBomLookup(lookup: BomLookup): void {
    this.bomLookup = lookup;
  }

  async exportImage(_doc: SchematicDocument, _path: string): Promise<Result<void>> {
    return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'Use exportSchImage for topology-based export' };
  }

  async exportPdf(doc: SchematicDocument, path: string): Promise<Result<void>> {
    const topo = TopologyAdapter.toTopology(doc);
    const pdfContent = TopoPdfExporter.export(topo);
    const result = await this.writeTextFile(path, pdfContent);
    return { success: result.success, errCode: result.success ? ErrCode.OK : ErrCode.ERR_PERMISSION, error: result.error };
  }

  getRecentFiles(): string[] { return copyStringArray(this.recentFiles); }

  addRecentFile(path: string): void {
    this.recentFiles = this.recentFiles.filter(p => p !== path);
    this.recentFiles.unshift(path);
    if (this.recentFiles.length > RECENT_MAX) {
      this.recentFiles = this.recentFiles.slice(0, RECENT_MAX);
    }
  }

  clearRecentFiles(): void { this.recentFiles = []; }

  setAppBaseDir(dir: string): void {
    this.appBaseDir = dir;
  }

  getSessionFilePath(): string {
    return `${this.appBaseDir}/session.json`;
  }

  async saveSessionState(lastPath: string, lastProjectName: string, closedCleanly: boolean): Promise<void> {
    if (!this.appBaseDir) return;
    const session: SessionState = {
      lastPath: lastPath,
      lastProjectName: lastProjectName,
      closedCleanly: closedCleanly,
      timestamp: new Date().toISOString()
    };
    try {
      await this.writeTextFile(this.getSessionFilePath(), mapAwareStringify(session as Object));
    } catch (_e) { /* best-effort */ }
  }

  async loadSessionState(): Promise<SessionState | null> {
    if (!this.appBaseDir) return null;
    try {
      fs.accessSync(this.getSessionFilePath());
      const json = await this.readFileText(this.getSessionFilePath());
      const session = mapAwareParse<SessionState>(json);
      return session;
    } catch (_e) { return null; }
  }

  async markSessionCleanShutdown(): Promise<void> {
    if (!this.appBaseDir) return;
    const session = await this.loadSessionState();
    if (session !== null) {
      await this.saveSessionState(session.lastPath, session.lastProjectName, true);
    }
  }

  async checkRecoveryFiles(): Promise<string[]> {
    const result: string[] = [];
    if (!this.appBaseDir) return result;
    // Check for session-based clues of abnormal shutdown instead of dir listing
    const session = await this.loadSessionState();
    if (session !== null && !session.closedCleanly) {
      // Last session was not cleanly closed — check auto-save
      const autoSavePath = `${this.appBaseDir}/autosave/${session.lastProjectName}.schsim`;
      try {
        fs.accessSync(autoSavePath);
        result.push(autoSavePath);
      } catch (_e) { /* no auto-save found */ }
      // Also check recovery dir — match the pattern used by saveRecoveryCacheWithPath
      // saveRecoveryCacheWithPath saves as recovery_{name}_{timestamp}.schsim,
      // so we scan the directory for any file matching recovery_{name}_*.schsim
      try {
        const recoveryDir = `${this.appBaseDir}/${RECOVERY_DIR}`;
        fs.accessSync(recoveryDir);
        const list = fs.listFileSync(recoveryDir);
        const prefix = `recovery_${session.lastProjectName}_`;
        for (let i = 0; i < list.length; i++) {
          if (list[i].startsWith(prefix) && list[i].endsWith('.schsim')) {
            result.push(`${recoveryDir}/${list[i]}`);
            break;
          }
        }
      } catch (_e) { /* no recovery dir */ }
    }
    return result;
  }

  async saveRecoveryCacheWithPath(path: string, project: ProjectFile): Promise<Result<void>> {
    if (!this.appBaseDir) {
      return { success: false, errCode: ErrCode.ERR_PERMISSION, error: 'Base dir not set' };
    }
    const recoveryDir = `${this.appBaseDir}/${RECOVERY_DIR}`;
    try {
      try { fs.accessSync(recoveryDir); } catch (_e){ fs.mkdirSync(recoveryDir); }
      const fileName = `recovery_${project.name}_${Date.now()}.schsim`;
      const fullPath = `${recoveryDir}/${fileName}`;
      return this.saveProject(project, fullPath);
    } catch (e) {
      return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Recovery save failed: ${e}` };
    }
  }

  enableAutoSave(intervalMs: number, savePath: string, callback: () => ProjectFile | null): void {
    this.disableAutoSave();
    this.autoSavePath = savePath;
    this.autoSaveCallback = callback;
    this.autoSaveTimer = setInterval(async () => {
      if (this.autoSaveCallback && this.autoSavePath) {
        const project = this.autoSaveCallback();
        if (project) {
          await this.saveProject(project, this.autoSavePath);
        }
      }
    }, intervalMs);
  }

  disableAutoSave(): void {
    if (this.autoSaveTimer >= 0) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = -1;
    }
  }

  async saveRecoveryCache(project: ProjectFile): Promise<Result<void>> {
    if (!this.appBaseDir) {
      return { success: false, errCode: ErrCode.ERR_PERMISSION, error: 'Base dir not set' };
    }
    const recoveryDir = `${this.appBaseDir}/${RECOVERY_DIR}`;
    try {
      try { fs.accessSync(recoveryDir); } catch (_e){ fs.mkdirSync(recoveryDir); }
      const fileName = `recovery_${project.name}_${Date.now()}.schsim`;
      const fullPath = `${recoveryDir}/${fileName}`;
      return this.saveProject(project, fullPath);
    } catch (e) {
      return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Recovery save failed: ${e}` };
    }
  }

  async loadRecoveryCache(projectName: string): Promise<Result<ProjectFile>> {
    return this.loadProject(`${RECOVERY_DIR}/recovery_${projectName}.schsim`);
  }

  // ---- internal ----

  /** 5.1.1 解析文件头 — 增加魔数校验 */
  private parseHeader(json: string): FileHeaderInfo {
    try {
      const parsed: object = JSON.parse(json) as object;
      const dict = parsed as Record<string, Object>;
      // 魔数校验: .schsim 格式标记
      const magicVal: Object = dict['magic'];
      const magic = typeof magicVal === 'string' ? magicVal : '';
      if (magic !== '' && magic !== 'SCHSIM') {
        return { isValid: false, version: '', format: FileFormat.SCHSIM, projectName: '' };
      }
      const versionVal: Object = dict['version'];
      const nameVal: Object = dict['name'];
      const version = typeof versionVal === 'string' ? versionVal : '1.0.0';
      const name = typeof nameVal === 'string' ? nameVal : 'Unknown';
      const hasTopo = dict['topology'] !== undefined;
      const hasSch = dict['schematic'] !== undefined;
      return {
        isValid: hasTopo || hasSch,
        version,
        format: FileFormat.SCHSIM,
        projectName: name
      };
    } catch (_e) {
      return { isValid: false, version: '', format: FileFormat.SCHSIM, projectName: '' };
    }
  }

  private legacyToSimConfig(cfg: SimulationConfig): SimConfig {
    const def = defaultSimConfig();
    def.simMode = FilePersistenceImpl.legacyModeToSimMode(cfg.mode);
    def.transientTotalTime = cfg.stopTime;
    def.minTimeStep = cfg.stepSize;
    def.maxTimeStep = cfg.maxStep;
    def.temperature = cfg.temperature;
    def.convergence = cfg.convergence;
    def.mcuClockHz = cfg.mcuClockHz ?? def.mcuClockHz;
    return def;
  }

  private simConfigToLegacy(cfg: SimConfig): SimulationConfig {
    return {
      mode: FilePersistenceImpl.simModeToLegacyMode(cfg.simMode),
      startTime: 0, stopTime: cfg.transientTotalTime,
      stepSize: cfg.minTimeStep, maxStep: cfg.maxTimeStep,
      temperature: cfg.temperature, convergence: cfg.convergence,
      mcuClockHz: cfg.mcuClockHz
    };
  }

  private projectDataToLegacy(data: ProjectData): ProjectFile {
    return {
      version: data.version,
      name: data.name,
      schematic: TopologyAdapter.fromTopology(data.topology),
      simulationConfig: this.simConfigToLegacy(data.simConfig),
      aiConfigs: data.aiConfigs,
      createdAt: data.createdAt,
      modifiedAt: data.modifiedAt,
      collaboration: data.collaboration
    };
  }

  private normalizeProjectData(data: ProjectData): void {
    if (!data.topology.busList) data.topology.busList = [];
    if (!data.topology.probeList) data.topology.probeList = [];
    if (!data.topology.ercErrorList) data.topology.ercErrorList = [];
    if (!data.topology.textAnnotate) data.topology.textAnnotate = [];
    if (!data.topology.netLabelList) data.topology.netLabelList = [];
  }

  private static buildHashPayload(data: ProjectData): string {
    interface HashPayload {
      version: string;
      name: string;
      topology: SchTopology;
      simConfig: SimConfig;
      aiConfigs: AiApiConfig[];
      createdAt: string;
      modifiedAt: string;
    }
    const payload: HashPayload = {
      version: data.version,
      name: data.name,
      topology: data.topology,
      simConfig: data.simConfig,
      aiConfigs: data.aiConfigs,
      createdAt: data.createdAt,
      modifiedAt: data.modifiedAt
    };
    return mapAwareStringify(payload);
  }

  private decryptAiConfigs(configs: AiApiConfig[]): void {
    for (const c of configs) {
      if (c.apiKey && !c.apiKey.startsWith('***')) {
        try { c.apiKey = CryptoUtil.decrypt(c.apiKey); } catch (_e) { /* keep as-is */ }
      }
      if (c.backupApiKey) {
        try { c.backupApiKey = CryptoUtil.decrypt(c.backupApiKey); } catch (_e) { /* keep */ }
      }
    }
  }

  private async readFileText(path: string): Promise<string> {
    try {
      const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(path);
      const buffer = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buffer);
      fs.closeSync(fileHandle);
      return arrayBufferToString(buffer);
    } catch (e) {
      throw new Error(`Failed to read file: ${path}`);
    }
  }

  private static legacyModeToSimMode(mode: SimulationMode): 'transient' | 'dc' | 'ac' | 'monte_carlo' | 'noise' | 'mixed' {
    switch (mode) {
      case SimulationMode.TRANSIENT:
        return 'transient';
      case SimulationMode.DC:
        return 'dc';
      case SimulationMode.AC:
        return 'ac';
      case SimulationMode.MONTE_CARLO:
        return 'monte_carlo';
      case SimulationMode.NOISE:
        return 'noise';
      case SimulationMode.MIXED:
      default:
        return 'mixed';
    }
  }

  private static simModeToLegacyMode(simMode: string): SimulationMode {
    switch (simMode) {
      case 'transient':
        return SimulationMode.TRANSIENT;
      case 'dc':
        return SimulationMode.DC;
      case 'ac':
        return SimulationMode.AC;
      case 'monte_carlo':
        return SimulationMode.MONTE_CARLO;
      case 'noise':
        return SimulationMode.NOISE;
      case 'mixed':
      default:
        return SimulationMode.MIXED;
    }
  }

  private async writeBinaryFile(path: string, data: Uint8Array): Promise<Result<void>> {
    try {
      const fileHandle = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(fileHandle.fd, data.buffer);
      fs.closeSync(fileHandle);
      return { success: true, errCode: ErrCode.OK };
    } catch (e) {
      return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Binary write failed: ${e}` };
    }
  }

  /** 5.2.10 事务性保存: 先写.tmp → 原子重命名 → 删除旧文件 */
  private async writeTextFile(path: string, content: string): Promise<Result<void>> {
    // For content URIs (file picker), write directly — rename not supported
    if (path.startsWith('content://') || path.startsWith('file://')) {
      try {
        const fileHandle = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
        fs.writeSync(fileHandle.fd, content);
        fs.closeSync(fileHandle);
        return { success: true, errCode: ErrCode.OK };
      } catch (e) {
        return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Write failed: ${e}` };
      }
    }
    // Regular filesystem path: transactional .tmp → atomic rename
    const tmpPath = `${path}.tmp`;
    try {
      const slash = path.lastIndexOf('/');
      if (slash > 0) {
        const parent = path.substring(0, slash);
        try { fs.accessSync(parent); } catch (_e) {
          try { fs.mkdirSync(parent, true); } catch (_e2) { /* best-effort */ }
        }
      }
      const fileHandle = fs.openSync(tmpPath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(fileHandle.fd, content);
      fs.closeSync(fileHandle);
      // Atomic rename — safely handle target file existence
      try {
        fs.accessSync(path);
        fs.unlinkSync(path);
      } catch (_e) {
        // Target file doesn't exist yet (first save / Save As), proceed with rename
      }
      fs.renameSync(tmpPath, path);
      return { success: true, errCode: ErrCode.OK };
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch (_e2) { /* ignore */ }
      return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Write failed: ${e}` };
    }
  }

  private parseKiCadBasic(content: string, path: string): SchematicDocument {
    const report = KiCadParser.parse(content, path);
    report.doc.metadata.description = `KiCad: ${formatImportReport(report)}`;
    return report.doc;
  }

  private parseLtspiceBasic(content: string, path: string): SchematicDocument {
    const report = LtspiceParser.parse(content, path);
    report.doc.metadata.description = `LTspice: ${formatImportReport(report)}`;
    return report.doc;
  }

  private wrapSvgForRasterExport(svg: string, topo: SchTopology): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!-- Raster-ready SVG for ${topo.schName} | ElecDraw export -->\n${svg}`;
  }
}
