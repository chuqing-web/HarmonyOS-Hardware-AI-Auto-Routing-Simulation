/**
 * 模块7：文件系统与数据持久化 API（v2 完备版）
 */
import {
  ProjectFile, SchematicDocument, FileFormat, Result,
  SchTopology, SimConfig, WaveData, AiApiConfig,
  ProgressCallback, ApiResult, CollaborationData,
  SnapshotMeta, VersionCompareReport, CollabChangeLogEntry,
  ProjectLockInfo, ProjectAccessMode, SchematicAnnotation, PcbDocument
} from 'common';

export interface ProjectData {
  magic?: string;
  version: string;
  name: string;
  topology: SchTopology;
  simConfig: SimConfig;
  aiConfigs: AiApiConfig[];
  pcb?: PcbDocument;
  createdAt: string;
  modifiedAt: string;
  integrityHash?: string;
  autoBackupEnabled?: boolean;
  backupPath?: string;
  collaboration?: CollaborationData;
}

export interface FileHeaderInfo {
  isValid: boolean;
  version: string;
  format: FileFormat;
  projectName: string;
}

export interface IFilePersistence {
  // ---- v2 API ----
  saveProjectData(data: ProjectData, path: string): Promise<ApiResult<void>>;
  loadProjectData(path: string): Promise<ApiResult<ProjectData>>;
  enableAutoBackup(intervalMs: number, backupDir: string, getData: () => ProjectData | null): void;
  disableAutoBackup(): void;
  restoreFromBackup(projectName: string): Promise<ApiResult<ProjectData>>;
  importProteusSch(path: string, onProgress?: ProgressCallback): Promise<ApiResult<SchTopology>>;
  exportSchImage(topo: SchTopology, path: string, format?: 'png' | 'svg'): Promise<ApiResult<void>>;
  exportWaveCsv(waves: WaveData[], path: string): Promise<ApiResult<void>>;
  saveAiApiConfig(configs: AiApiConfig[], path: string): Promise<ApiResult<void>>;
  loadAiApiConfig(path: string): Promise<ApiResult<AiApiConfig[]>>;
  checkFileHeader(path: string): Promise<ApiResult<FileHeaderInfo>>;
  repairCorruptProject(path: string): Promise<ApiResult<ProjectData>>;

  // ---- 协作 / 版本 ----
  initCollaboration(workspaceDir: string): void;
  createProjectSnapshot(versionLabel: string, note: string, topo: SchTopology, author: string): Promise<ApiResult<SnapshotMeta>>;
  listProjectSnapshots(): SnapshotMeta[];
  compareProjectSnapshots(fromId: string, toId: string, topo: SchTopology): ApiResult<VersionCompareReport>;
  getProjectChangeLog(): CollabChangeLogEntry[];
  appendProjectChangeLog(user: string, action: string, target: string, detail: string): CollabChangeLogEntry;
  acquireProjectLock(projectPath: string, holderId: string, holderName: string, mode: ProjectAccessMode): ApiResult<ProjectLockInfo>;
  releaseProjectLock(projectPath: string, holderId: string): ApiResult<void>;
  getProjectLockInfo(projectPath: string): ProjectLockInfo | null;
  clearStaleProjectLock(projectPath: string): void;
  buildCollaborationBundle(annotations: SchematicAnnotation[]): CollaborationData;

  // ---- v1 兼容 ----
  saveProject(file: ProjectFile, path: string): Promise<Result<void>>;
  loadProject(path: string): Promise<Result<ProjectFile>>;
  createNewProject(name: string): ProjectFile;
  importSchematic(path: string, format: FileFormat): Promise<Result<SchematicDocument>>;
  exportSchematic(doc: SchematicDocument, path: string, format: FileFormat): Promise<Result<void>>;
  exportNetlist(doc: SchematicDocument, path: string): Promise<Result<void>>;
  exportBom(doc: SchematicDocument, path: string): Promise<Result<void>>;
  exportImage(doc: SchematicDocument, path: string): Promise<Result<void>>;
  exportPdf(doc: SchematicDocument, path: string): Promise<Result<void>>;
  getRecentFiles(): string[];
  addRecentFile(path: string): void;
  clearRecentFiles(): void;
  enableAutoSave(intervalMs: number, savePath: string, callback: () => ProjectFile | null): void;
  disableAutoSave(): void;
}
