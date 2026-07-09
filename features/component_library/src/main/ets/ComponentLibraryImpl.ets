/**
 * 模块2：器件库完整实现
 * 支持三分体文件规范（meta.json + symbol.svg + model）与内置器件双源合并
 */
import { IComponentLibrary, ComponentDefinition } from './api/IComponentLibrary';
import { getAllBuiltinComponents } from './data/BuiltinComponents';
import { DeviceLibraryLoader } from './loader/DeviceLibraryLoader';
import {
  ComponentCategory, Result, PaginatedResult, DeviceMeta, McuSimModel
} from 'common';
import fs from '@ohos.file.fs';
import { arrayBufferToString } from './internal/ComponentLibHelpers';
import { matchesPinyin } from './internal/PinyinSearch';
import { ProteusAliasLoader } from './internal/ProteusAliasLoader';
import { LibraryPackExporter } from './internal/LibraryPackExporter';

interface ScoredComponent {
  comp: ComponentDefinition;
  score: number;
}

export class ComponentLibraryImpl implements IComponentLibrary {
  private components: Map<string, ComponentDefinition> = new Map();
  private deviceMetas: Map<string, DeviceMeta> = new Map();
  private fileLoader: DeviceLibraryLoader | null = null;
  private libraryRootPath: string = '';
  private version: string = '2.1.0';
  private invertedIndex: Map<string, Set<string>> = new Map();
  private indexDirty: boolean = true;
  private aliasLoader: ProteusAliasLoader = new ProteusAliasLoader();
  private usageStats: Map<string, number> = new Map(); // 4.3.12 使用统计
  private totalDocCount: number = 0;
  private avgDocLength: number = 0;
  private debounceTimer: number = -1;  // 4.4.17 防抖支持

  constructor(libraryRootPath?: string) {
    const builtins = getAllBuiltinComponents();
    for (let i = 0; i < builtins.length; i++) {
      const c = builtins[i];
      this.components.set(c.id, c);
    }
    if (libraryRootPath) {
      this.initFromDeviceLibrary(libraryRootPath);
    }
  }

  initFromDeviceLibrary(rootPath: string): Result<number> {
    this.libraryRootPath = rootPath;
    this.fileLoader = new DeviceLibraryLoader(rootPath);
    const result = this.fileLoader.loadAll();
    if (!result.success || result.data === undefined) {
      return result;
    }
    return this.mergeLoadedBundles(result.data);
  }

  refreshIncremental(): Result<number> {
    if (!this.fileLoader) {
      return { success: false, error: 'Library loader not initialized' };
    }
    const result = this.fileLoader.loadIncremental();
    if (!result.success || result.data === undefined) {
      return result;
    }
    if (result.data === 0) {
      return { success: true, data: 0 };
    }
    return this.mergeLoadedBundles(result.data);
  }

  private mergeLoadedBundles(count: number): Result<number> {
    if (!this.fileLoader) {
      return { success: false, error: 'Library loader not initialized' };
    }
    const fileComponents = this.fileLoader.toComponentDefinitions();
    for (let i = 0; i < fileComponents.length; i++) {
      const comp = fileComponents[i];
      this.components.set(comp.id, comp);
      const metaResult = this.fileLoader.getDeviceMeta(comp.id);
      if (metaResult.success && metaResult.data) {
        this.deviceMetas.set(comp.id, metaResult.data);
      }
    }
    this.version = `2.1.${this.deviceMetas.size}`;
    this.indexDirty = true;
    return { success: true, data: count };
  }

  private static parseResistanceValue(val: string): number {
    const s = val.trim().toUpperCase().replace(/Ω|OHM/g, '');
    let mult = 1;
    if (s.endsWith('K')) {
      mult = 1000;
    } else if (s.endsWith('M')) {
      mult = 1e6;
    } else if (s.endsWith('G')) {
      mult = 1e9;
    }
    const numStr = mult > 1 ? s.substring(0, s.length - 1) : s;
    const n = parseFloat(numStr);
    return Number.isFinite(n) ? n * mult : 0;
  }

  private rebuildIndexIfNeeded(): void {
    if (!this.indexDirty) return;
    this.invertedIndex.clear();
    this.components.forEach((c: ComponentDefinition, id: string) => {
      this.indexToken(id, id);
      this.indexToken(c.name, id);
      this.indexToken(c.manufacturer, id);
      this.indexToken(c.description, id);
      for (let j = 0; j < c.aiWiringRules.length; j++) {
        this.indexToken(c.aiWiringRules[j], id);
      }
      if (c.category) this.indexToken(c.category, id);
    });
    this.indexDirty = false;
  }

  private indexToken(text: string, compId: string): void {
    if (!text || text.length === 0) return;
    const words = text.toLowerCase().split(/[\s_\-/]+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length === 0) continue;
      if (!this.invertedIndex.has(w)) this.invertedIndex.set(w, new Set());
      this.invertedIndex.get(w)!.add(compId);
      for (let len = 1; len <= Math.min(w.length, 8); len++) {
        const prefix = w.substring(0, len);
        if (!this.invertedIndex.has(prefix)) this.invertedIndex.set(prefix, new Set());
        this.invertedIndex.get(prefix)!.add(compId);
      }
    }
  }

  private searchByIndex(keyword: string): Set<string> | null {
    this.rebuildIndexIfNeeded();
    const lower = keyword.toLowerCase();
    const direct = this.invertedIndex.get(lower);
    if (direct) return direct;
    const result = new Set<string>();
    this.invertedIndex.forEach((ids: Set<string>, token: string) => {
      if (token.includes(lower)) ids.forEach((id: string) => result.add(id));
    });
    return result.size > 0 ? result : null;
  }

  listByCategory(category: ComponentCategory, page: number = 1, pageSize: number = 50): PaginatedResult<ComponentDefinition> {
    const all = Array.from(this.components.values());
    const filtered: ComponentDefinition[] = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].category === category) {
        filtered.push(all[i]);
      }
    }
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page: page, pageSize: pageSize };
  }

  search(keyword: string, page: number = 1, pageSize: number = 50): PaginatedResult<ComponentDefinition> {
    const lower = keyword.toLowerCase();
    const rangeMatch = keyword.match(/([\d.]+)\s*(k|K|m|M|u|n|p|Ω|R)?\s*[~\-–]\s*([\d.]+)\s*(k|K|m|M|u|n|p|Ω|R)?/);
    const indexHits = this.searchByIndex(keyword);
    const filtered: ComponentDefinition[] = [];
    const seen = new Set<string>();

    const tryAdd = (c: ComponentDefinition): void => {
      if (seen.has(c.id)) return;
      if (rangeMatch) {
        const val = c.defaultParams.get('value') ?? '';
        const num = ComponentLibraryImpl.parseResistanceValue(val);
        const min = ComponentLibraryImpl.parseResistanceValue(`${rangeMatch[1]}${rangeMatch[2] ?? ''}`);
        const max = ComponentLibraryImpl.parseResistanceValue(`${rangeMatch[3]}${rangeMatch[4] ?? ''}`);
        if (num < min || num > max) return;
      }
      seen.add(c.id);
      filtered.push(c);
    };

    if (indexHits) {
      indexHits.forEach((id: string) => {
        const c = this.components.get(id);
        if (c) tryAdd(c);
      });
    }

    const all = Array.from(this.components.values());
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      let matched = c.name.toLowerCase().includes(lower) ||
        c.id.toLowerCase().includes(lower) ||
        c.manufacturer.toLowerCase().includes(lower) ||
        c.description.toLowerCase().includes(lower) ||
        matchesPinyin(`${c.name} ${c.description}`, keyword);
      if (!matched) {
        for (let j = 0; j < c.aiWiringRules.length; j++) {
          if (c.aiWiringRules[j].includes(lower)) {
            matched = true;
            break;
          }
        }
      }
      if (matched) tryAdd(c);
    }
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page: page, pageSize: pageSize };
  }

  /** 4.1.2 BM25 排序算法 — 对高频词自动降权 */
  semanticSearch(query: string, limit: number = 10): ComponentDefinition[] {
    const keywords = query.toLowerCase().split(/\s+/);
    const scored: ScoredComponent[] = [];
    const all = Array.from(this.components.values());
    const N = all.length;
    const k1 = 1.5; const b = 0.75;

    // 计算平均文档长度
    if (this.avgDocLength === 0) {
      let totalLen = 0;
      for (const c of all) totalLen += `${c.name} ${c.description}`.length;
      this.avgDocLength = totalLen / Math.max(N, 1);
    }

    for (let i = 0; i < all.length; i++) {
      const comp = all[i];
      const text = `${comp.name} ${comp.id} ${comp.description} ${comp.aiWiringRules.join(' ')}`.toLowerCase();
      const docLen = text.length;
      let bm25 = 0;

      for (let k = 0; k < keywords.length; k++) {
        const kw = keywords[k];
        // 计算该项的 DF (Document Frequency)
        let df = 0;
        for (const c of all) {
          const t = `${c.name} ${c.id} ${c.description}`.toLowerCase();
          if (t.includes(kw)) df++;
        }
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        // TF in this document
        let tf = 0;
        let idx = 0;
        while ((idx = text.indexOf(kw, idx)) !== -1) { tf++; idx += kw.length; }
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / Math.max(this.avgDocLength, 1)));
        bm25 += idf * tfNorm;
        // 精确ID匹配加权
        if (comp.id.toLowerCase() === kw) bm25 += 2.0;
      }
      // 使用频率加权 (4.3.12)
      const usageBonus = Math.log(1 + (this.usageStats.get(comp.id) ?? 0)) * 0.5;
      bm25 += usageBonus;
      if (bm25 > 0) scored.push({ comp: comp, score: bm25 });
    }
    scored.sort((a: ScoredComponent, b: ScoredComponent) => b.score - a.score);
    const result: ComponentDefinition[] = [];
    for (let i = 0; i < Math.min(limit, scored.length); i++) result.push(scored[i].comp);
    return result;
  }

  /** 4.3.12 记录器件使用 */
  recordComponentUsage(libraryId: string): void {
    this.usageStats.set(libraryId, (this.usageStats.get(libraryId) ?? 0) + 1);
  }

  /** 4.3.12 获取器件使用统计 */
  getUsageStats(): Map<string, number> {
    return new Map(this.usageStats);
  }

  /** 4.4.17 防抖搜索 (返回结果通过回调) */
  searchDebounced(keyword: string, page: number, pageSize: number,
                  callback: (result: PaginatedResult<ComponentDefinition>) => void,
                  delayMs: number = 300): void {
    if (this.debounceTimer >= 0) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      callback(this.search(keyword, page, pageSize));
    }, delayMs);
  }

  getComponent(libraryId: string): Result<ComponentDefinition> {
    const comp = this.components.get(libraryId);
    if (!comp) return { success: false, error: `Component ${libraryId} not found` };
    return { success: true, data: comp };
  }

  getDeviceMeta(libraryId: string): Result<DeviceMeta> {
    const meta = this.deviceMetas.get(libraryId);
    if (meta) return { success: true, data: meta };
    if (this.fileLoader) {
      return this.fileLoader.getDeviceMeta(libraryId);
    }
    return { success: false, error: `DeviceMeta ${libraryId} not found` };
  }

  getSpiceModel(libraryId: string): Result<string> {
    if (this.fileLoader) {
      const fileResult = this.fileLoader.getSpiceModel(libraryId);
      if (fileResult.success) return fileResult;
    }
    const comp = this.components.get(libraryId);
    if (!comp) return { success: false, error: 'Component not found' };
    return { success: true, data: comp.spiceModel };
  }

  getMcuModel(libraryId: string): Result<McuSimModel> {
    if (this.fileLoader) {
      return this.fileLoader.getMcuModel(libraryId);
    }
    return { success: false, error: 'MCU model not available' };
  }

  getDigitalModel(libraryId: string): Result<string> {
    if (this.fileLoader) {
      return this.fileLoader.getDigitalModel(libraryId);
    }
    const comp = this.components.get(libraryId);
    if (!comp) return { success: false, error: 'Component not found' };
    return { success: true, data: comp.behaviorModel };
  }

  getSvgSymbol(libraryId: string): Result<string> {
    if (this.fileLoader) {
      const fileResult = this.fileLoader.getSvgSymbol(libraryId);
      if (fileResult.success) return fileResult;
    }
    const comp = this.components.get(libraryId);
    if (!comp) return { success: false, error: 'Component not found' };
    return { success: true, data: comp.svgSymbol };
  }

  getErcRules(libraryId: string): Result<string[]> {
    const meta = this.deviceMetas.get(libraryId);
    if (meta !== undefined && meta.erc_check_rules !== undefined) {
      return { success: true, data: meta.erc_check_rules };
    }
    const metaResult = this.getDeviceMeta(libraryId);
    if (metaResult.success && metaResult.data !== undefined && metaResult.data.erc_check_rules !== undefined) {
      return { success: true, data: metaResult.data.erc_check_rules };
    }
    return { success: true, data: [] };
  }

  getCategories(): ComponentCategory[] {
    return [
      ComponentCategory.PASSIVE,
      ComponentCategory.DISCRETE,
      ComponentCategory.ANALOG_IC,
      ComponentCategory.DIGITAL_IC,
      ComponentCategory.MEMORY,
      ComponentCategory.SENSOR,
      ComponentCategory.PERIPHERAL,
      ComponentCategory.MCU_8051,
      ComponentCategory.MCU_STM32,
      ComponentCategory.INSTRUMENT,
      ComponentCategory.POWER_SUPPLY
    ];
  }

  importComponent(definition: ComponentDefinition): Result<void> {
    this.components.set(definition.id, definition);
    return { success: true };
  }

  importFromJson(json: string): Result<number> {
    try {
      const items = JSON.parse(json) as ComponentDefinition[];
      let count = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        this.components.set(item.id, item);
        count++;
      }
      return { success: true, data: count };
    } catch (e) {
      return { success: false, error: `Invalid JSON: ${e}` };
    }
  }

  batchUpdateParams(libraryId: string, params: Map<string, string>): Result<number> {
    const comp = this.components.get(libraryId);
    if (!comp) return { success: false, error: 'Component not found' };
    params.forEach((value: string, key: string) => {
      comp.defaultParams.set(key, value);
    });
    return { success: true, data: 1 };
  }

  replaceComponents(oldId: string, newId: string): Result<void> {
    const oldComp = this.components.get(oldId);
    const newComp = this.components.get(newId);
    if (!oldComp || !newComp) return { success: false, error: 'Component not found' };
    if (oldComp.category !== newComp.category) {
      return { success: false, error: 'Category mismatch' };
    }
    this.components.delete(oldId);
    return { success: true };
  }

  updateLibrary(packagePath: string): Result<number> {
    try {
      const stat = fs.statSync(packagePath);
      if (stat.isDirectory()) {
        return this.initFromDeviceLibrary(packagePath);
      }
      const fileHandle = fs.openSync(packagePath, fs.OpenMode.READ_ONLY);
      const buffer = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buffer);
      fs.closeSync(fileHandle);
      const json = arrayBufferToString(buffer);
      const result = this.importFromJson(json);
      if (result.success && result.data !== undefined) {
        this.version = `2.1.${result.data}`;
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e) {
      return { success: false, error: `Library update failed: ${e}` };
    }
  }

  getLibraryVersion(): string { return this.version; }
  getTotalCount(): number { return this.components.size; }
  getAllComponents(): ComponentDefinition[] { return Array.from(this.components.values()); }

  /** 从 rawfile JSON 加载 Proteus/PCAD/EAGLE 别名表 */
  loadProteusAliases(jsonText: string): number {
    const count = this.aliasLoader.loadFromJson(jsonText);
    return count;
  }

  /** 带厂商前缀的别名解析 */
  resolveWithVendor(name: string, vendor: string = ''): string {
    const resolved = this.aliasLoader.resolve(name, vendor);
    return this.resolveLibraryId(resolved);
  }

  resolveLibraryId(idOrAlias: string): string {
    if (this.components.has(idOrAlias)) return idOrAlias;
    const aliasResolved = this.aliasLoader.resolve(idOrAlias, '');
    if (aliasResolved !== idOrAlias && this.components.has(aliasResolved)) return aliasResolved;
    const mapped = ComponentLibraryImpl.PROTEUS_ALIASES.get(idOrAlias.toUpperCase());
    if (mapped !== undefined && this.components.has(mapped)) return mapped;
    if (idOrAlias === 'STM32F103C8' && this.components.has('STM32F103C8T6')) return 'STM32F103C8T6';
    if (idOrAlias === 'STM32F103C8T6' && this.components.has('STM32F103C8')) return 'STM32F103C8';
    const upper = idOrAlias.toUpperCase();
    const allComps = Array.from(this.components.values());
    for (let i = 0; i < allComps.length; i++) {
      if (allComps[i].id.toUpperCase() === upper) return allComps[i].id;
    }
    return idOrAlias;
  }

  mapProteusDevId(proteusName: string): string {
    return this.resolveLibraryId(proteusName);
  }

  exportOfflinePack(outDir: string): Result<string> {
    if (this.libraryRootPath.length === 0) {
      return { success: false, error: '器件库路径未初始化' };
    }
    return LibraryPackExporter.exportPack(this.libraryRootPath, outDir);
  }

  importOfflinePack(packDir: string): Result<number> {
    if (this.libraryRootPath.length === 0) {
      return { success: false, error: '器件库路径未初始化' };
    }
    const imported = LibraryPackExporter.importPack(packDir, this.libraryRootPath);
    if (imported.success && imported.data !== undefined && imported.data > 0) {
      return this.refreshIncremental();
    }
    return imported;
  }

  private static readonly PROTEUS_ALIASES: Map<string, string> = new Map([
    ['STM32F103C8T6', 'STM32F103C8'],
    ['STM32F103C8', 'STM32F103C8'],
    ['STM32F103', 'STM32F103C8'],
    ['AT89C51', 'AT89C51'],
    ['AT89C52', 'AT89C52'],
    ['74HC04', '74HC04'],
    ['7404', '74HC04'],
    ['LM358', 'LM358'],
    ['LM358N', 'LM358'],
    ['RES', 'R_1k'],
    ['CAP', 'C_100nF'],
    ['DIODE', '1N4148'],
    ['LED', 'LED_RED'],
    ['CRYSTAL', 'XTAL_11M'],
    ['OSCILLOSCOPE', 'OSCILLOSCOPE'],
    ['R10K', 'R_10k'],
    ['R1K', 'R_1k'],
    ['C100NF', 'C_100nF']
  ]);
}
