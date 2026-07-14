/**
 * 插件管理 API
 */
import {
  PluginInfo, PluginManifest, PluginPermission, SchTopology, WaveData,
  ApiResult, ProgressCallback
} from 'common';

export interface IPluginManager {
  loadPlugin(manifestPath: string): ApiResult<PluginInfo>;
  unloadPlugin(pluginId: string): ApiResult<void>;
  listPlugins(): PluginInfo[];
  enablePlugin(pluginId: string): ApiResult<void>;
  disablePlugin(pluginId: string): ApiResult<void>;
  verifySignature(pluginId: string): ApiResult<boolean>;
  requestPermissions(pluginId: string, perms: PluginPermission[]): ApiResult<boolean>;
  hotReload(pluginId: string): ApiResult<void>;
  executeScript(pluginId: string, scriptName: string, args?: Map<string, string>): ApiResult<string>;
  readTopology(pluginId: string): ApiResult<SchTopology | null>;
  writeTopology(pluginId: string, topo: SchTopology): ApiResult<void>;
  readWaveData(pluginId: string): ApiResult<WaveData[]>;
  importPluginsDir(dirPath: string, onProgress?: ProgressCallback): ApiResult<number>;
  setPluginInstallDir(dir: string): void;
}
