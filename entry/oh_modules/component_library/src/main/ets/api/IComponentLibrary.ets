/**
 * 模块2：器件库 API
 */
import {
  ComponentCategory, Pin, Result, PaginatedResult,
  DeviceMeta, McuSimModel
} from 'common';

export interface ComponentDefinition {
  id: string;
  name: string;
  category: ComponentCategory;
  manufacturer: string;
  description: string;
  pins: Pin[];
  defaultParams: Map<string, string>;
  spiceModel: string;
  behaviorModel: string;
  svgSymbol: string;
  aiWiringRules: string[];
}

export interface IComponentLibrary {
  /** 按分类获取器件列表（分页） */
  listByCategory(category: ComponentCategory, page?: number, pageSize?: number): PaginatedResult<ComponentDefinition>;

  /** 按分类获取全部器件（不分页，供库面板完整展示） */
  listAllByCategory(category: ComponentCategory): ComponentDefinition[];

  /** 搜索器件 */
  search(keyword: string, page?: number, pageSize?: number): PaginatedResult<ComponentDefinition>;

  /** 获取器件详情 */
  getComponent(libraryId: string): Result<ComponentDefinition>;

  /** 获取器件 meta.json 原始描述（三分体规范） */
  getDeviceMeta(libraryId: string): Result<DeviceMeta>;

  /** 获取器件SPICE模型 */
  getSpiceModel(libraryId: string): Result<string>;

  /** 获取器件MCU仿真模型 */
  getMcuModel(libraryId: string): Result<McuSimModel>;

  /** 获取器件数字逻辑行为模型 */
  getDigitalModel(libraryId: string): Result<string>;

  /** 获取器件SVG符号 */
  getSvgSymbol(libraryId: string): Result<string>;

  /** 获取 ERC 校验规则 */
  getErcRules(libraryId: string): Result<string[]>;

  /** 从 DeviceLibrary 目录加载三分体器件文件 */
  initFromDeviceLibrary(rootPath: string): Result<number>;

  /** 获取所有分类 */
  getCategories(): ComponentCategory[];

  /** 导入自定义器件 */
  importComponent(definition: ComponentDefinition): Result<void>;

  /** 更新器件库（在线升级） */
  updateLibrary(packagePath: string): Result<number>;

  /** 获取库版本 */
  getLibraryVersion(): string;

  /** 获取器件总数 */
  getTotalCount(): number;

  /** 语义搜索 */
  semanticSearch(query: string, limit?: number): ComponentDefinition[];

  /** 解析器件 ID（含 Proteus 别名映射） */
  resolveLibraryId(idOrAlias: string): string;
  mapProteusDevId(proteusName: string): string;
}
