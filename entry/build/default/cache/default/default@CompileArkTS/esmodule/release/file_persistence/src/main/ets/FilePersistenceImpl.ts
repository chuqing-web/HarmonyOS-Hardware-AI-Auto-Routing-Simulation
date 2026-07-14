import type { IFilePersistence, ProjectData, FileHeaderInfo } from './api/IFilePersistence';
import { ProteusParser } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/parsers/ProteusParser";
import { KiCadParser } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/parsers/KiCadParser";
import { LtspiceParser } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/parsers/LtspiceParser";
import { formatImportReport } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/parsers/ImportReport";
import { CollaborationService } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/collaboration/CollaborationService";
import { FileFormat, SimulationMode, EventBus, ModuleEvent, CryptoUtil, ErrCode, ResultHelper, Validate, TopologyAdapter, defaultSimConfig, makeProgress, paramMapGet, mapAwareStringify, mapAwareParse, errCodeMessage } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ProjectFile, SchematicDocument, Result, SimulationConfig, SchTopology, SimConfig, WaveData, AiApiConfig, ProgressCallback, ApiResult, SnapshotMeta, VersionCompareReport, CollabChangeLogEntry, ProjectLockInfo, ProjectAccessMode, CollaborationData, SchematicAnnotation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import fs from "@ohos:file.fs";
import { arrayBufferToString, buildProjectDataForSave, encryptAiApiConfigs, encryptAiApiConfigsForSave, copyStringArray, maxOfNumbers } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/FilePersistenceHelpers";
import { TopoPngExporter } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/export/TopoPngExporter";
import { TopoSvgExporter } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/export/TopoSvgExporter";
import { TopoPdfExporter } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/export/TopoPdfExporter";
import { buildBomCsv } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/BomExportHelper";
import type { BomLookup } from "@bundle:com.elecdraw.aischsim/entry@file_persistence/ets/internal/BomExportHelper";
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
    async saveProjectData(p356: ProjectData, q356: string): Promise<ApiResult<void>> {
        const r356 = Validate.filePath(q356);
        if (r356 !== null)
            return ResultHelper.fail(r356);
        try {
            const t356 = CryptoUtil.sha256(mapAwareStringify(p356.topology as Object)).substring(0, 16);
            const u356 = CryptoUtil.sha256(mapAwareStringify(p356.simConfig as Object)).substring(0, 16);
            const v356 = CryptoUtil.sha256(mapAwareStringify(p356.aiConfigs as Object)).substring(0, 16);
            const w356 = this.sectionHashes.get(`${q356}:topology`) ?? '';
            const x356 = this.sectionHashes.get(`${q356}:simConfig`) ?? '';
            const y356 = this.sectionHashes.get(`${q356}:aiConfigs`) ?? '';
            const z356 = w356 === t356 && x356 === u356 && y356 === v356;
            let a357 = p356;
            if (z356) {
                try {
                    fs.accessSync(q356);
                    const f357 = await this.readFileText(q356);
                    const g357 = mapAwareParse<ProjectData>(f357);
                    g357.modifiedAt = p356.modifiedAt;
                    g357.name = p356.name;
                    a357 = g357;
                }
                catch (e357) { }
            }
            const b357 = buildProjectDataForSave(a357, SCHSIM_VERSION, new Date().toISOString(), this.collaboration.exportCollaborationData([]), encryptAiApiConfigsForSave(a357.aiConfigs));
            b357.integrityHash = CryptoUtil.sha256(FilePersistenceImpl.buildHashPayload(b357));
            const c357 = mapAwareStringify(b357 as Object, true);
            await this.writeTextFile(q356, c357);
            this.sectionHashes.set(`${q356}:topology`, t356);
            this.sectionHashes.set(`${q356}:simConfig`, u356);
            this.sectionHashes.set(`${q356}:aiConfigs`, v356);
            this.addRecentFile(q356);
            const d357: FilePathEventData = { path: q356 };
            EventBus.getInstance().publish({
                event: ModuleEvent.FILE_SAVED,
                source: 'file_persistence',
                timestamp: Date.now(),
                data: d357
            });
            return ResultHelper.ok();
        }
        catch (s356) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Save failed: ${s356}`);
        }
    }
    async loadProjectData(d356: string): Promise<ApiResult<ProjectData>> {
        const e356 = Validate.filePath(d356);
        if (e356 !== null)
            return ResultHelper.fail(e356);
        try {
            const g356 = await this.readFileText(d356);
            const h356 = this.parseHeader(g356);
            if (!h356.isValid) {
                const o356 = await this.repairCorruptProject(d356);
                if (o356.success && o356.data)
                    return o356;
                return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, 'Invalid project file');
            }
            const i356 = mapAwareParse<ProjectData>(g356);
            if (i356.integrityHash) {
                const k356 = i356.integrityHash;
                const l356 = FilePersistenceImpl.buildHashPayload(i356);
                const m356 = CryptoUtil.sha256(l356);
                if (m356 !== k356) {
                    const n356 = await this.repairCorruptProject(d356);
                    if (n356.success && n356.data) {
                        return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `${errCodeMessage(ErrCode.ERR_FILE_CORRUPT)} — 已尝试恢复，请验证内容`);
                    }
                    return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, '文件已损坏或被篡改，校验码不匹配');
                }
            }
            this.decryptAiConfigs(i356.aiConfigs);
            this.normalizeProjectData(i356);
            this.collaboration.loadCollaborationData(i356.collaboration);
            this.lastTopologyForSnapshot = i356.topology;
            this.addRecentFile(d356);
            const j356: FilePathEventData = { path: d356 };
            EventBus.getInstance().publish({
                event: ModuleEvent.FILE_LOADED,
                source: 'file_persistence',
                timestamp: Date.now(),
                data: j356
            });
            return ResultHelper.ok(i356);
        }
        catch (f356) {
            return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `Load failed: ${f356}`);
        }
    }
    enableAutoBackup(y355: number, z355: string, a356: () => ProjectData | null): void {
        this.disableAutoBackup();
        this.autoBackupDir = z355;
        this.autoBackupCallback = a356;
        this.autoBackupTimer = setInterval(async () => {
            if (this.autoBackupCallback && this.autoBackupDir) {
                const b356 = this.autoBackupCallback();
                if (b356) {
                    const c356 = `${this.autoBackupDir}/backup_${b356.name}_${Date.now()}.schsim`;
                    await this.saveProjectData(b356, c356);
                }
            }
        }, y355);
    }
    disableAutoBackup(): void {
        if (this.autoBackupTimer >= 0) {
            clearInterval(this.autoBackupTimer);
            this.autoBackupTimer = -1;
        }
    }
    async restoreFromBackup(s355: string): Promise<ApiResult<ProjectData>> {
        try {
            const u355 = this.autoBackupDir || RECOVERY_DIR;
            const v355 = fs.listFileSync(u355);
            const w355 = v355.filter(x355 => x355.startsWith(`backup_${s355}_`) && x355.endsWith('.schsim'))
                .sort()
                .reverse();
            if (w355.length === 0) {
                return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, 'No backup found');
            }
            return this.loadProjectData(`${u355}/${w355[0]}`);
        }
        catch (t355) {
            return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `Restore failed: ${t355}`);
        }
    }
    async importProteusSch(l355: string, m355?: ProgressCallback): Promise<ApiResult<SchTopology>> {
        const n355 = Validate.filePath(l355);
        if (n355 !== null)
            return ResultHelper.fail(n355);
        m355?.(makeProgress(10, 'Reading Proteus schematic'));
        try {
            const p355 = await this.readFileText(l355);
            m355?.(makeProgress(50, 'Parsing schematic'));
            const q355 = ProteusParser.parse(p355, l355);
            const r355 = TopologyAdapter.toTopology(q355.doc);
            r355.schName = q355.doc.name;
            m355?.(makeProgress(90, formatImportReport(q355)));
            m355?.(makeProgress(100, 'Import complete', true));
            return ResultHelper.ok(r355);
        }
        catch (o355) {
            m355?.(makeProgress(100, 'Import failed', true, ErrCode.ERR_FILE_CORRUPT, `${o355}`));
            return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `Proteus import failed: ${o355}`);
        }
    }
    async exportSchImage(b355: SchTopology, c355: string, d355: 'png' | 'svg' = 'png'): Promise<ApiResult<void>> {
        const e355 = Validate.filePath(c355);
        if (e355 !== null)
            return ResultHelper.fail(e355);
        try {
            const g355 = TopoSvgExporter.export(b355);
            if (d355 === 'svg') {
                const k355 = await this.writeTextFile(c355, g355);
                return k355.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, k355.error);
            }
            const h355 = c355.endsWith('.png') ? c355 : `${c355}.png`;
            const i355 = TopoPngExporter.export(b355);
            const j355 = await this.writeBinaryFile(h355, i355);
            return j355.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, j355.error);
        }
        catch (f355) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Image export failed: ${f355}`);
        }
    }
    async exportWaveCsv(p354: WaveData[], q354: string): Promise<ApiResult<void>> {
        const r354 = Validate.filePath(q354);
        if (r354 !== null)
            return ResultHelper.fail(r354);
        let s354 = 'time';
        for (const a355 of p354)
            s354 += `,${a355.probeName}_V,${a355.probeName}_I`;
        s354 += '\n';
        const t354: number[] = [];
        for (let z354 = 0; z354 < p354.length; z354++) {
            t354.push(p354[z354].timeAxis.length);
        }
        const u354 = maxOfNumbers(t354);
        for (let w354 = 0; w354 < u354; w354++) {
            const x354 = p354[0]?.timeAxis[w354] ?? w354;
            s354 += `${x354}`;
            for (const y354 of p354) {
                s354 += `,${y354.voltageAxis[w354] ?? ''},${y354.currentAxis[w354] ?? ''}`;
            }
            s354 += '\n';
        }
        const v354 = await this.writeTextFile(q354, s354);
        return v354.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, v354.error);
    }
    async saveAiApiConfig(l354: AiApiConfig[], m354: string): Promise<ApiResult<void>> {
        const n354 = encryptAiApiConfigs(l354);
        const o354 = await this.writeTextFile(m354, JSON.stringify(n354, null, 2));
        return o354.success ? ResultHelper.ok() : ResultHelper.fail(ErrCode.ERR_PERMISSION, o354.error);
    }
    async loadAiApiConfig(h354: string): Promise<ApiResult<AiApiConfig[]>> {
        try {
            const j354 = await this.readFileText(h354);
            const k354 = JSON.parse(j354) as AiApiConfig[];
            this.decryptAiConfigs(k354);
            return ResultHelper.ok(k354);
        }
        catch (i354) {
            return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `Load AI config failed: ${i354}`);
        }
    }
    async checkFileHeader(e354: string): Promise<ApiResult<FileHeaderInfo>> {
        try {
            const g354 = await this.readFileText(e354);
            return ResultHelper.ok(this.parseHeader(g354));
        }
        catch (f354) {
            return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `${f354}`);
        }
    }
    async repairCorruptProject(w353: string): Promise<ApiResult<ProjectData>> {
        try {
            let y353 = await this.readFileText(w353);
            y353 = y353.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            const z353: object = JSON.parse(y353) as object;
            const a354 = z353 as Record<string, Object>;
            const b354 = new Date().toISOString();
            let c354: ProjectData;
            if (a354['topology'] !== undefined) {
                c354 = z353 as ProjectData;
            }
            else if (a354['schematic'] !== undefined) {
                const d354 = z353 as ProjectFile;
                c354 = {
                    version: d354.version ?? SCHSIM_VERSION,
                    name: d354.name,
                    topology: TopologyAdapter.toTopology(d354.schematic),
                    simConfig: this.legacyToSimConfig(d354.simulationConfig),
                    aiConfigs: d354.aiConfigs ?? [],
                    createdAt: d354.createdAt ?? b354,
                    modifiedAt: b354
                };
            }
            else {
                return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, 'Unrecoverable format');
            }
            c354.version = SCHSIM_VERSION;
            c354.modifiedAt = b354;
            this.normalizeProjectData(c354);
            await this.saveProjectData(c354, w353);
            return ResultHelper.ok(c354);
        }
        catch (x353) {
            return ResultHelper.fail(ErrCode.ERR_FILE_CORRUPT, `Repair failed: ${x353}`);
        }
    }
    initCollaboration(v353: string): void {
        this.collaboration.init(v353);
    }
    async createProjectSnapshot(p353: string, q353: string, r353: SchTopology, s353: string): Promise<ApiResult<SnapshotMeta>> {
        const t353 = this.lastTopologyForSnapshot ?? undefined;
        const u353 = this.collaboration.createSnapshot(p353, q353, r353, s353, t353);
        if (u353.success && u353.data !== undefined) {
            this.lastTopologyForSnapshot = r353;
            EventBus.getInstance().publish({
                event: ModuleEvent.SNAPSHOT_CREATED,
                source: 'file_persistence',
                timestamp: Date.now(),
                data: u353.data
            });
        }
        return u353;
    }
    listProjectSnapshots(): SnapshotMeta[] {
        return this.collaboration.listSnapshots();
    }
    compareProjectSnapshots(m353: string, n353: string, o353: SchTopology): ApiResult<VersionCompareReport> {
        return this.collaboration.compareSnapshots(m353, n353, o353);
    }
    getProjectChangeLog(): CollabChangeLogEntry[] {
        return this.collaboration.getChangeLog();
    }
    appendProjectChangeLog(i353: string, j353: string, k353: string, l353: string): CollabChangeLogEntry {
        return this.collaboration.appendChangeLog(i353, j353, k353, l353);
    }
    acquireProjectLock(d353: string, e353: string, f353: string, g353: ProjectAccessMode): ApiResult<ProjectLockInfo> {
        const h353 = this.collaboration.acquireLock(d353, e353, f353, g353);
        if (h353.success && h353.data !== undefined) {
            EventBus.getInstance().publish({
                event: ModuleEvent.PROJECT_LOCK_CHANGED,
                source: 'file_persistence',
                timestamp: Date.now(),
                data: h353.data
            });
        }
        return h353;
    }
    releaseProjectLock(z352: string, a353: string): ApiResult<void> {
        const b353 = this.collaboration.releaseLock(z352, a353);
        const c353: ProjectLockReleaseData = { released: true, projectPath: z352 };
        EventBus.getInstance().publish({
            event: ModuleEvent.PROJECT_LOCK_CHANGED,
            source: 'file_persistence',
            timestamp: Date.now(),
            data: c353
        });
        return b353;
    }
    getProjectLockInfo(y352: string): ProjectLockInfo | null {
        return this.collaboration.getLockInfo(y352);
    }
    clearStaleProjectLock(x352: string): void {
        this.collaboration.clearStaleLock(x352);
    }
    buildCollaborationBundle(w352: SchematicAnnotation[]): CollaborationData {
        return this.collaboration.exportCollaborationData(w352);
    }
    async saveProject(s352: ProjectFile, t352: string): Promise<Result<void>> {
        const u352: ProjectData = {
            version: s352.version,
            name: s352.name,
            topology: TopologyAdapter.toTopology(s352.schematic),
            simConfig: this.legacyToSimConfig(s352.simulationConfig),
            aiConfigs: s352.aiConfigs,
            createdAt: s352.createdAt,
            modifiedAt: s352.modifiedAt,
            collaboration: s352.collaboration ?? this.collaboration.exportCollaborationData([])
        };
        const v352 = await this.saveProjectData(u352, t352);
        return { success: v352.success, errCode: v352.errCode, error: v352.error };
    }
    async loadProject(p352: string): Promise<Result<ProjectFile>> {
        const q352 = await this.loadProjectData(p352);
        if (!q352.success || !q352.data) {
            return { success: false, errCode: q352.errCode, error: q352.error };
        }
        const r352 = this.projectDataToLegacy(q352.data);
        return { success: true, errCode: ErrCode.OK, data: r352 };
    }
    createNewProject(n352: string): ProjectFile {
        const o352 = new Date().toISOString();
        return {
            version: SCHSIM_VERSION,
            name: n352,
            schematic: {
                id: `sch_${Date.now()}`,
                name: n352,
                version: '2.0',
                components: [], wires: [], nets: [], netLabels: [], subcircuits: [],
                metadata: {
                    author: '',
                    createdAt: o352, modifiedAt: o352,
                    description: '', gridSize: 10, units: 'mm', undoLimit: 1000
                }
            },
            simulationConfig: {
                mode: SimulationMode.MIXED, startTime: 0, stopTime: 0.001,
                stepSize: 1e-6, maxStep: 1e-5, temperature: 27, convergence: 1e-6,
                mcuClockHz: 11059200
            },
            aiConfigs: [],
            createdAt: o352,
            modifiedAt: o352,
            collaboration: { annotations: [], snapshots: [], changeLog: [] }
        };
    }
    async importSchematic(i352: string, j352: FileFormat): Promise<Result<SchematicDocument>> {
        try {
            const l352 = await this.readFileText(i352);
            switch (j352) {
                case FileFormat.PROTEUS_SCH: {
                    const m352 = await this.importProteusSch(i352);
                    if (!m352.success || !m352.data) {
                        return { success: false, errCode: m352.errCode, error: m352.error };
                    }
                    return { success: true, errCode: ErrCode.OK, data: TopologyAdapter.fromTopology(m352.data) };
                }
                case FileFormat.KICAD:
                    return { success: true, errCode: ErrCode.OK, data: this.parseKiCadBasic(l352, i352) };
                case FileFormat.LTSPICE:
                    return { success: true, errCode: ErrCode.OK, data: this.parseLtspiceBasic(l352, i352) };
                default:
                    return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Unsupported format: ${j352}` };
            }
        }
        catch (k352) {
            return { success: false, errCode: ErrCode.ERR_FILE_NOT_FOUND, error: `Import failed: ${k352}` };
        }
    }
    async exportSchematic(e352: SchematicDocument, f352: string, g352: FileFormat): Promise<Result<void>> {
        if (g352 === FileFormat.SCHSIM) {
            const h352 = this.createNewProject(e352.name);
            h352.schematic = e352;
            return this.saveProject(h352, f352);
        }
        if (g352 === FileFormat.NETLIST)
            return this.exportNetlist(e352, f352);
        if (g352 === FileFormat.BOM)
            return this.exportBom(e352, f352);
        return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Export format ${g352} not yet implemented` };
    }
    async exportNetlist(x351: SchematicDocument, y351: string): Promise<Result<void>> {
        let z351 = `* AI-SCH SPICE Netlist\n* ${x351.name}\n\n`;
        let a352 = 1;
        for (const c352 of x351.components) {
            const d352 = paramMapGet(c352.parameters, 'value', '');
            if (c352.libraryId.startsWith('R_')) {
                z351 += `R${a352} ${c352.refDes}_1 ${c352.refDes}_2 ${d352 || c352.libraryId.replace('R_', '')}\n`;
                a352++;
            }
            else {
                z351 += `* ${c352.refDes}: ${c352.libraryId}\n`;
            }
        }
        z351 += `\n.end\n`;
        const b352 = await this.writeTextFile(y351, z351);
        return { success: b352.success, errCode: b352.success ? ErrCode.OK : ErrCode.ERR_PERMISSION, error: b352.error };
    }
    async exportBom(t351: SchematicDocument, u351: string): Promise<Result<void>> {
        const v351 = buildBomCsv(t351, this.bomLookup ?? undefined);
        const w351 = await this.writeTextFile(u351, v351);
        return { success: w351.success, errCode: w351.success ? ErrCode.OK : ErrCode.ERR_PERMISSION, error: w351.error };
    }
    setBomLookup(s351: BomLookup): void {
        this.bomLookup = s351;
    }
    async exportImage(q351: SchematicDocument, r351: string): Promise<Result<void>> {
        return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: 'Use exportSchImage for topology-based export' };
    }
    async exportPdf(l351: SchematicDocument, m351: string): Promise<Result<void>> {
        const n351 = TopologyAdapter.toTopology(l351);
        const o351 = TopoPdfExporter.export(n351);
        const p351 = await this.writeTextFile(m351, o351);
        return { success: p351.success, errCode: p351.success ? ErrCode.OK : ErrCode.ERR_PERMISSION, error: p351.error };
    }
    getRecentFiles(): string[] { return copyStringArray(this.recentFiles); }
    addRecentFile(j351: string): void {
        this.recentFiles = this.recentFiles.filter(k351 => k351 !== j351);
        this.recentFiles.unshift(j351);
        if (this.recentFiles.length > RECENT_MAX) {
            this.recentFiles = this.recentFiles.slice(0, RECENT_MAX);
        }
    }
    clearRecentFiles(): void { this.recentFiles = []; }
    setAppBaseDir(i351: string): void {
        this.appBaseDir = i351;
    }
    getSessionFilePath(): string {
        return `${this.appBaseDir}/session.json`;
    }
    async saveSessionState(d351: string, e351: string, f351: boolean): Promise<void> {
        if (!this.appBaseDir)
            return;
        const g351: SessionState = {
            lastPath: d351,
            lastProjectName: e351,
            closedCleanly: f351,
            timestamp: new Date().toISOString()
        };
        try {
            await this.writeTextFile(this.getSessionFilePath(), mapAwareStringify(g351 as Object));
        }
        catch (h351) { }
    }
    async loadSessionState(): Promise<SessionState | null> {
        if (!this.appBaseDir)
            return null;
        try {
            fs.accessSync(this.getSessionFilePath());
            const b351 = await this.readFileText(this.getSessionFilePath());
            const c351 = mapAwareParse<SessionState>(b351);
            return c351;
        }
        catch (a351) {
            return null;
        }
    }
    async markSessionCleanShutdown(): Promise<void> {
        if (!this.appBaseDir)
            return;
        const z350 = await this.loadSessionState();
        if (z350 !== null) {
            await this.saveSessionState(z350.lastPath, z350.lastProjectName, true);
        }
    }
    async checkRecoveryFiles(): Promise<string[]> {
        const q350: string[] = [];
        if (!this.appBaseDir)
            return q350;
        const r350 = await this.loadSessionState();
        if (r350 !== null && !r350.closedCleanly) {
            const s350 = `${this.appBaseDir}/autosave/${r350.lastProjectName}.schsim`;
            try {
                fs.accessSync(s350);
                q350.push(s350);
            }
            catch (y350) { }
            try {
                const u350 = `${this.appBaseDir}/${RECOVERY_DIR}`;
                fs.accessSync(u350);
                const v350 = fs.listFileSync(u350);
                const w350 = `recovery_${r350.lastProjectName}_`;
                for (let x350 = 0; x350 < v350.length; x350++) {
                    if (v350[x350].startsWith(w350) && v350[x350].endsWith('.schsim')) {
                        q350.push(`${u350}/${v350[x350]}`);
                        break;
                    }
                }
            }
            catch (t350) { }
        }
        return q350;
    }
    async saveRecoveryCacheWithPath(j350: string, k350: ProjectFile): Promise<Result<void>> {
        if (!this.appBaseDir) {
            return { success: false, errCode: ErrCode.ERR_PERMISSION, error: 'Base dir not set' };
        }
        const l350 = `${this.appBaseDir}/${RECOVERY_DIR}`;
        try {
            try {
                fs.accessSync(l350);
            }
            catch (p350) {
                fs.mkdirSync(l350);
            }
            const n350 = `recovery_${k350.name}_${Date.now()}.schsim`;
            const o350 = `${l350}/${n350}`;
            return this.saveProject(k350, o350);
        }
        catch (m350) {
            return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Recovery save failed: ${m350}` };
        }
    }
    enableAutoSave(f350: number, g350: string, h350: () => ProjectFile | null): void {
        this.disableAutoSave();
        this.autoSavePath = g350;
        this.autoSaveCallback = h350;
        this.autoSaveTimer = setInterval(async () => {
            if (this.autoSaveCallback && this.autoSavePath) {
                const i350 = this.autoSaveCallback();
                if (i350) {
                    await this.saveProject(i350, this.autoSavePath);
                }
            }
        }, f350);
    }
    disableAutoSave(): void {
        if (this.autoSaveTimer >= 0) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = -1;
        }
    }
    async saveRecoveryCache(z349: ProjectFile): Promise<Result<void>> {
        if (!this.appBaseDir) {
            return { success: false, errCode: ErrCode.ERR_PERMISSION, error: 'Base dir not set' };
        }
        const a350 = `${this.appBaseDir}/${RECOVERY_DIR}`;
        try {
            try {
                fs.accessSync(a350);
            }
            catch (e350) {
                fs.mkdirSync(a350);
            }
            const c350 = `recovery_${z349.name}_${Date.now()}.schsim`;
            const d350 = `${a350}/${c350}`;
            return this.saveProject(z349, d350);
        }
        catch (b350) {
            return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Recovery save failed: ${b350}` };
        }
    }
    async loadRecoveryCache(y349: string): Promise<Result<ProjectFile>> {
        return this.loadProject(`${RECOVERY_DIR}/recovery_${y349}.schsim`);
    }
    private parseHeader(m349: string): FileHeaderInfo {
        try {
            const o349: object = JSON.parse(m349) as object;
            const p349 = o349 as Record<string, Object>;
            const q349: Object = p349['magic'];
            const r349 = typeof q349 === 'string' ? q349 : '';
            if (r349 !== '' && r349 !== 'SCHSIM') {
                return { isValid: false, version: '', format: FileFormat.SCHSIM, projectName: '' };
            }
            const s349: Object = p349['version'];
            const t349: Object = p349['name'];
            const u349 = typeof s349 === 'string' ? s349 : '1.0.0';
            const v349 = typeof t349 === 'string' ? t349 : 'Unknown';
            const w349 = p349['topology'] !== undefined;
            const x349 = p349['schematic'] !== undefined;
            return {
                isValid: w349 || x349,
                version: u349,
                format: FileFormat.SCHSIM,
                projectName: v349
            };
        }
        catch (n349) {
            return { isValid: false, version: '', format: FileFormat.SCHSIM, projectName: '' };
        }
    }
    private legacyToSimConfig(k349: SimulationConfig): SimConfig {
        const l349 = defaultSimConfig();
        l349.simMode = FilePersistenceImpl.legacyModeToSimMode(k349.mode);
        l349.transientTotalTime = k349.stopTime;
        l349.minTimeStep = k349.stepSize;
        l349.maxTimeStep = k349.maxStep;
        l349.temperature = k349.temperature;
        l349.convergence = k349.convergence;
        l349.mcuClockHz = k349.mcuClockHz ?? l349.mcuClockHz;
        return l349;
    }
    private simConfigToLegacy(j349: SimConfig): SimulationConfig {
        return {
            mode: FilePersistenceImpl.simModeToLegacyMode(j349.simMode),
            startTime: 0,
            stopTime: j349.transientTotalTime,
            stepSize: j349.minTimeStep, maxStep: j349.maxTimeStep,
            temperature: j349.temperature, convergence: j349.convergence,
            mcuClockHz: j349.mcuClockHz
        };
    }
    private projectDataToLegacy(i349: ProjectData): ProjectFile {
        return {
            version: i349.version,
            name: i349.name,
            schematic: TopologyAdapter.fromTopology(i349.topology),
            simulationConfig: this.simConfigToLegacy(i349.simConfig),
            aiConfigs: i349.aiConfigs,
            createdAt: i349.createdAt,
            modifiedAt: i349.modifiedAt,
            collaboration: i349.collaboration
        };
    }
    private normalizeProjectData(h349: ProjectData): void {
        if (!h349.topology.busList)
            h349.topology.busList = [];
        if (!h349.topology.probeList)
            h349.topology.probeList = [];
        if (!h349.topology.ercErrorList)
            h349.topology.ercErrorList = [];
        if (!h349.topology.textAnnotate)
            h349.topology.textAnnotate = [];
    }
    private static buildHashPayload(e349: ProjectData): string {
        interface f349 {
            version: string;
            name: string;
            topology: SchTopology;
            simConfig: SimConfig;
            aiConfigs: AiApiConfig[];
            createdAt: string;
            modifiedAt: string;
        }
        const g349: f349 = {
            version: e349.version,
            name: e349.name,
            topology: e349.topology,
            simConfig: e349.simConfig,
            aiConfigs: e349.aiConfigs,
            createdAt: e349.createdAt,
            modifiedAt: e349.modifiedAt
        };
        return mapAwareStringify(g349);
    }
    private decryptAiConfigs(a349: AiApiConfig[]): void {
        for (const b349 of a349) {
            if (b349.apiKey && !b349.apiKey.startsWith('***')) {
                try {
                    b349.apiKey = CryptoUtil.decrypt(b349.apiKey);
                }
                catch (d349) { }
            }
            if (b349.backupApiKey) {
                try {
                    b349.backupApiKey = CryptoUtil.decrypt(b349.backupApiKey);
                }
                catch (c349) { }
            }
        }
    }
    private async readFileText(v348: string): Promise<string> {
        try {
            const x348 = fs.openSync(v348, fs.OpenMode.READ_ONLY);
            const y348 = fs.statSync(v348);
            const z348 = new ArrayBuffer(y348.size);
            fs.readSync(x348.fd, z348);
            fs.closeSync(x348);
            return arrayBufferToString(z348);
        }
        catch (w348) {
            throw new Error(`Failed to read file: ${v348}`);
        }
    }
    private static legacyModeToSimMode(u348: SimulationMode): 'transient' | 'dc' | 'ac' | 'monte_carlo' | 'noise' | 'mixed' {
        switch (u348) {
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
    private static simModeToLegacyMode(t348: string): SimulationMode {
        switch (t348) {
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
    private async writeBinaryFile(p348: string, q348: Uint8Array): Promise<Result<void>> {
        try {
            const s348 = fs.openSync(p348, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(s348.fd, q348.buffer);
            fs.closeSync(s348);
            return { success: true, errCode: ErrCode.OK };
        }
        catch (r348) {
            return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Binary write failed: ${r348}` };
        }
    }
    private async writeTextFile(h348: string, i348: string): Promise<Result<void>> {
        if (h348.startsWith('content://')) {
            try {
                const o348 = fs.openSync(h348, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                fs.writeSync(o348.fd, i348);
                fs.closeSync(o348);
                return { success: true, errCode: ErrCode.OK };
            }
            catch (n348) {
                return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Write failed: ${n348}` };
            }
        }
        const j348 = `${h348}.tmp`;
        try {
            const l348 = fs.openSync(j348, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(l348.fd, i348);
            fs.closeSync(l348);
            try {
                fs.accessSync(h348);
                fs.unlinkSync(h348);
            }
            catch (m348) {
            }
            fs.renameSync(j348, h348);
            return { success: true, errCode: ErrCode.OK };
        }
        catch (k348) {
            return { success: false, errCode: ErrCode.ERR_PERMISSION, error: `Write failed: ${k348}` };
        }
    }
    private parseKiCadBasic(e348: string, f348: string): SchematicDocument {
        const g348 = KiCadParser.parse(e348, f348);
        g348.doc.metadata.description = `KiCad: ${formatImportReport(g348)}`;
        return g348.doc;
    }
    private parseLtspiceBasic(b348: string, c348: string): SchematicDocument {
        const d348 = LtspiceParser.parse(b348, c348);
        d348.doc.metadata.description = `LTspice: ${formatImportReport(d348)}`;
        return d348.doc;
    }
    private wrapSvgForRasterExport(z347: string, a348: SchTopology): string {
        return `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<!-- Raster-ready SVG for ${a348.schName} | ElecDraw export -->\n${z347}`;
    }
}
