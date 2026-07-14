/**
 * 平台服务类型：版本、打印、协作、无障碍
 */
export interface ProjectSnapshot {
    id: string;
    name: string;
    note: string;
    timestamp: string;
    topologyHash: string;
    dataPath: string;
}
export interface VersionDiff {
    addedDevices: string[];
    removedDevices: string[];
    modifiedDevices: string[];
    addedNets: string[];
    removedWires: number;
}
export interface ChangeLogEntry {
    timestamp: string;
    user: string;
    action: string;
    target: string;
    detail: string;
}
export interface PrintConfig {
    paperSize: 'A4' | 'A3' | 'A2' | 'custom';
    orientation: 'portrait' | 'landscape';
    marginMm: number;
    colorMode: 'color' | 'bw' | 'film';
    layerFilter: 'all' | 'analog' | 'digital' | 'mcu';
    headerText: string;
    footerText: string;
    showPageNumber: boolean;
}
export interface Annotation {
    id: string;
    author: string;
    text: string;
    x: number;
    y: number;
    targetUuid: string;
    createdAt: string;
}
export interface AccessibilityConfig {
    highContrast: boolean;
    keyboardOnly: boolean;
    uiScale: number;
    screenReader: boolean;
}
export interface ProxyConfig {
    globalProxy: string;
    systemProxy: boolean;
    offlineMode: boolean;
}
export interface HotUpdateInfo {
    version: string;
    changelog: string[];
    packageSize: number;
    rollbackAvailable: boolean;
}
export enum LengthUnit {
    MIL = "mil",
    MM = "mm",
    INCH = "inch"
}
