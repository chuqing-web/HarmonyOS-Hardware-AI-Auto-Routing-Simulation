export enum PluginPermission {
    READ_SCHEMATIC = "read_schematic",
    WRITE_SCHEMATIC = "write_schematic",
    READ_SIM_DATA = "read_sim_data",
    NETWORK = "network",
    READ_KEYS = "read_keys"
}
export enum PluginType {
    SCRIPT = "script",
    DEVICE_WIZARD = "device_wizard",
    AI_TASK_EXT = "ai_task_ext",
    SIM_TOOL = "sim_tool",
    IMPORT_EXPORT = "import_export"
}
export interface PluginInfo {
    id: string;
    name: string;
    version: string;
    type: PluginType;
    path: string;
    signed: boolean;
    enabled: boolean;
    permissions: PluginPermission[];
}
export interface PluginManifest {
    id: string;
    name: string;
    entryPoint: string;
    permissions: PluginPermission[];
    signature: string;
}
