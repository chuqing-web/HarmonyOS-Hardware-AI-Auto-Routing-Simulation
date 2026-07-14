export enum SchematicAnnotationType {
    TEXT = "text",
    RECT = "rect",
    ARROW = "arrow",
    FAULT_MARK = "fault_mark",
    SUGGESTION = "suggestion"
}
export enum SchematicAnnotationStatus {
    PENDING = "pending",
    FIXED = "fixed",
    IGNORED = "ignored"
}
export type AnnotationTargetKind = 'device' | 'net' | 'region';
export interface SchematicAnnotation {
    id: string;
    author: string;
    text: string;
    type: SchematicAnnotationType;
    status: SchematicAnnotationStatus;
    x: number;
    y: number;
    width?: number;
    height?: number;
    arrowEndX?: number;
    arrowEndY?: number;
    targetUuid: string;
    targetKind: AnnotationTargetKind;
    createdAt: string;
    updatedAt: string;
}
export interface SnapshotMeta {
    id: string;
    versionLabel: string;
    note: string;
    timestamp: string;
    topologyHash: string;
    diffFilePath: string;
    author: string;
}
export interface TopologySnapshotDiff {
    baseHash: string;
    snapshotHash: string;
    addedDevices: string[];
    removedDevices: string[];
    modifiedDevices: string[];
    addedNets: string[];
    removedNets: string[];
    modifiedParams: string[];
    wireCountDelta: number;
    hexConfigChanged: boolean;
}
export interface VersionCompareReport {
    fromSnapshotId: string;
    toSnapshotId: string;
    diff: TopologySnapshotDiff;
    powerChanges: string[];
    mcuChanges: string[];
    peripheralChanges: string[];
    summaryLines: string[];
}
export interface CollabChangeLogEntry {
    id: string;
    timestamp: string;
    user: string;
    action: string;
    target: string;
    detail: string;
}
export type ProjectAccessMode = 'read_only' | 'editable';
export interface ProjectLockInfo {
    projectPath: string;
    holderId: string;
    holderName: string;
    mode: ProjectAccessMode;
    acquiredAt: string;
    stale: boolean;
}
export interface CollaborationData {
    annotations: SchematicAnnotation[];
    snapshots: SnapshotMeta[];
    changeLog: CollabChangeLogEntry[];
}
