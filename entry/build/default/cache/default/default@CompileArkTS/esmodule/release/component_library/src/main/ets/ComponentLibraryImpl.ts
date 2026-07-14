import type { IComponentLibrary, ComponentDefinition } from './api/IComponentLibrary';
import { getAllBuiltinComponents } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/data/BuiltinComponents";
import { DeviceLibraryLoader } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/loader/DeviceLibraryLoader";
import { ComponentCategory } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Result, PaginatedResult, DeviceMeta, McuSimModel } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import fs from "@ohos:file.fs";
import { arrayBufferToString } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ComponentLibHelpers";
import { matchesPinyin } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/PinyinSearch";
import { ProteusAliasLoader } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ProteusAliasLoader";
import { LibraryPackExporter } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/LibraryPackExporter";
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
    private usageStats: Map<string, number> = new Map();
    private totalDocCount: number = 0;
    private avgDocLength: number = 0;
    private debounceTimer: number = -1;
    constructor(g321?: string) {
        const h321 = getAllBuiltinComponents();
        for (let i321 = 0; i321 < h321.length; i321++) {
            const j321 = h321[i321];
            this.components.set(j321.id, j321);
        }
        if (g321) {
            this.initFromDeviceLibrary(g321);
        }
    }
    initFromDeviceLibrary(e321: string): Result<number> {
        this.libraryRootPath = e321;
        this.fileLoader = new DeviceLibraryLoader(e321);
        const f321 = this.fileLoader.loadAll();
        if (!f321.success || f321.data === undefined) {
            return f321;
        }
        return this.mergeLoadedBundles(f321.data);
    }
    refreshIncremental(): Result<number> {
        if (!this.fileLoader) {
            return { success: false, error: 'Library loader not initialized' };
        }
        const d321 = this.fileLoader.loadIncremental();
        if (!d321.success || d321.data === undefined) {
            return d321;
        }
        if (d321.data === 0) {
            return { success: true, data: 0 };
        }
        return this.mergeLoadedBundles(d321.data);
    }
    private mergeLoadedBundles(y320: number): Result<number> {
        if (!this.fileLoader) {
            return { success: false, error: 'Library loader not initialized' };
        }
        const z320 = this.fileLoader.toComponentDefinitions();
        for (let a321 = 0; a321 < z320.length; a321++) {
            const b321 = z320[a321];
            this.components.set(b321.id, b321);
            const c321 = this.fileLoader.getDeviceMeta(b321.id);
            if (c321.success && c321.data) {
                this.deviceMetas.set(b321.id, c321.data);
            }
        }
        this.version = `2.1.${this.deviceMetas.size}`;
        this.indexDirty = true;
        return { success: true, data: y320 };
    }
    private static parseResistanceValue(t320: string): number {
        const u320 = t320.trim().toUpperCase().replace(/Ω|OHM/g, '');
        let v320 = 1;
        if (u320.endsWith('K')) {
            v320 = 1000;
        }
        else if (u320.endsWith('M')) {
            v320 = 1e6;
        }
        else if (u320.endsWith('G')) {
            v320 = 1e9;
        }
        const w320 = v320 > 1 ? u320.substring(0, u320.length - 1) : u320;
        const x320 = parseFloat(w320);
        return Number.isFinite(x320) ? x320 * v320 : 0;
    }
    private rebuildIndexIfNeeded(): void {
        if (!this.indexDirty)
            return;
        this.invertedIndex.clear();
        this.components.forEach((q320: ComponentDefinition, r320: string) => {
            this.indexToken(r320, r320);
            this.indexToken(q320.name, r320);
            this.indexToken(q320.manufacturer, r320);
            this.indexToken(q320.description, r320);
            for (let s320 = 0; s320 < q320.aiWiringRules.length; s320++) {
                this.indexToken(q320.aiWiringRules[s320], r320);
            }
            if (q320.category)
                this.indexToken(q320.category, r320);
        });
        this.indexDirty = false;
    }
    private indexToken(j320: string, k320: string): void {
        if (!j320 || j320.length === 0)
            return;
        const l320 = j320.toLowerCase().split(/[\s_\-/]+/);
        for (let m320 = 0; m320 < l320.length; m320++) {
            const n320 = l320[m320];
            if (n320.length === 0)
                continue;
            if (!this.invertedIndex.has(n320))
                this.invertedIndex.set(n320, new Set());
            this.invertedIndex.get(n320)!.add(k320);
            for (let o320 = 1; o320 <= Math.min(n320.length, 8); o320++) {
                const p320 = n320.substring(0, o320);
                if (!this.invertedIndex.has(p320))
                    this.invertedIndex.set(p320, new Set());
                this.invertedIndex.get(p320)!.add(k320);
            }
        }
    }
    private searchByIndex(c320: string): Set<string> | null {
        this.rebuildIndexIfNeeded();
        const d320 = c320.toLowerCase();
        const e320 = this.invertedIndex.get(d320);
        if (e320)
            return e320;
        const f320 = new Set<string>();
        this.invertedIndex.forEach((g320: Set<string>, h320: string) => {
            if (h320.includes(d320))
                g320.forEach((i320: string) => f320.add(i320));
        });
        return f320.size > 0 ? f320 : null;
    }
    listByCategory(v319: ComponentCategory, w319: number = 1, x319: number = 50): PaginatedResult<ComponentDefinition> {
        const y319 = Array.from(this.components.values());
        const z319: ComponentDefinition[] = [];
        for (let b320 = 0; b320 < y319.length; b320++) {
            if (y319[b320].category === v319) {
                z319.push(y319[b320]);
            }
        }
        const a320 = (w319 - 1) * x319;
        return { items: z319.slice(a320, a320 + x319), total: z319.length, page: w319, pageSize: x319 };
    }
    search(z318: string, a319: number = 1, b319: number = 50): PaginatedResult<ComponentDefinition> {
        const c319 = z318.toLowerCase();
        const d319 = z318.match(/([\d.]+)\s*(k|K|m|M|u|n|p|Ω|R)?\s*[~\-–]\s*([\d.]+)\s*(k|K|m|M|u|n|p|Ω|R)?/);
        const e319 = this.searchByIndex(z318);
        const f319: ComponentDefinition[] = [];
        const g319 = new Set<string>();
        const h319 = (q319: ComponentDefinition): void => {
            if (g319.has(q319.id))
                return;
            if (d319) {
                const r319 = q319.defaultParams.get('value') ?? '';
                const s319 = ComponentLibraryImpl.parseResistanceValue(r319);
                const t319 = ComponentLibraryImpl.parseResistanceValue(`${d319[1]}${d319[2] ?? ''}`);
                const u319 = ComponentLibraryImpl.parseResistanceValue(`${d319[3]}${d319[4] ?? ''}`);
                if (s319 < t319 || s319 > u319)
                    return;
            }
            g319.add(q319.id);
            f319.push(q319);
        };
        if (e319) {
            e319.forEach((o319: string) => {
                const p319 = this.components.get(o319);
                if (p319)
                    h319(p319);
            });
        }
        const i319 = Array.from(this.components.values());
        for (let k319 = 0; k319 < i319.length; k319++) {
            const l319 = i319[k319];
            let m319 = l319.name.toLowerCase().includes(c319) ||
                l319.id.toLowerCase().includes(c319) ||
                l319.manufacturer.toLowerCase().includes(c319) ||
                l319.description.toLowerCase().includes(c319) ||
                matchesPinyin(`${l319.name} ${l319.description}`, z318);
            if (!m319) {
                for (let n319 = 0; n319 < l319.aiWiringRules.length; n319++) {
                    if (l319.aiWiringRules[n319].includes(c319)) {
                        m319 = true;
                        break;
                    }
                }
            }
            if (m319)
                h319(l319);
        }
        const j319 = (a319 - 1) * b319;
        return { items: f319.slice(j319, j319 + b319), total: f319.length, page: a319, pageSize: b319 };
    }
    semanticSearch(w317: string, x317: number = 10): ComponentDefinition[] {
        const y317 = w317.toLowerCase().split(/\s+/);
        const z317: ScoredComponent[] = [];
        const a318 = Array.from(this.components.values());
        const b318 = a318.length;
        const c318 = 1.5;
        const d318 = 0.75;
        if (this.avgDocLength === 0) {
            let x318 = 0;
            for (const y318 of a318)
                x318 += `${y318.name} ${y318.description}`.length;
            this.avgDocLength = x318 / Math.max(b318, 1);
        }
        for (let i318 = 0; i318 < a318.length; i318++) {
            const j318 = a318[i318];
            const k318 = `${j318.name} ${j318.id} ${j318.description} ${j318.aiWiringRules.join(' ')}`.toLowerCase();
            const l318 = k318.length;
            let m318 = 0;
            for (let o318 = 0; o318 < y317.length; o318++) {
                const p318 = y317[o318];
                let q318 = 0;
                for (const v318 of a318) {
                    const w318 = `${v318.name} ${v318.id} ${v318.description}`.toLowerCase();
                    if (w318.includes(p318))
                        q318++;
                }
                const r318 = Math.log((b318 - q318 + 0.5) / (q318 + 0.5) + 1);
                let s318 = 0;
                let t318 = 0;
                while ((t318 = k318.indexOf(p318, t318)) !== -1) {
                    s318++;
                    t318 += p318.length;
                }
                const u318 = (s318 * (c318 + 1)) / (s318 + c318 * (1 - d318 + d318 * l318 / Math.max(this.avgDocLength, 1)));
                m318 += r318 * u318;
                if (j318.id.toLowerCase() === p318)
                    m318 += 2.0;
            }
            const n318 = Math.log(1 + (this.usageStats.get(j318.id) ?? 0)) * 0.5;
            m318 += n318;
            if (m318 > 0)
                z317.push({ comp: j318, score: m318 });
        }
        z317.sort((g318: ScoredComponent, h318: ScoredComponent) => h318.score - g318.score);
        const e318: ComponentDefinition[] = [];
        for (let f318 = 0; f318 < Math.min(x317, z317.length); f318++)
            e318.push(z317[f318].comp);
        return e318;
    }
    recordComponentUsage(v317: string): void {
        this.usageStats.set(v317, (this.usageStats.get(v317) ?? 0) + 1);
    }
    getUsageStats(): Map<string, number> {
        return new Map(this.usageStats);
    }
    searchDebounced(q317: string, r317: number, s317: number, t317: (result: PaginatedResult<ComponentDefinition>) => void, u317: number = 300): void {
        if (this.debounceTimer >= 0)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            t317(this.search(q317, r317, s317));
        }, u317);
    }
    getComponent(o317: string): Result<ComponentDefinition> {
        const p317 = this.components.get(o317);
        if (!p317)
            return { success: false, error: `Component ${o317} not found` };
        return { success: true, data: p317 };
    }
    getDeviceMeta(m317: string): Result<DeviceMeta> {
        const n317 = this.deviceMetas.get(m317);
        if (n317)
            return { success: true, data: n317 };
        if (this.fileLoader) {
            return this.fileLoader.getDeviceMeta(m317);
        }
        return { success: false, error: `DeviceMeta ${m317} not found` };
    }
    getSpiceModel(j317: string): Result<string> {
        if (this.fileLoader) {
            const l317 = this.fileLoader.getSpiceModel(j317);
            if (l317.success)
                return l317;
        }
        const k317 = this.components.get(j317);
        if (!k317)
            return { success: false, error: 'Component not found' };
        return { success: true, data: k317.spiceModel };
    }
    getMcuModel(i317: string): Result<McuSimModel> {
        if (this.fileLoader) {
            return this.fileLoader.getMcuModel(i317);
        }
        return { success: false, error: 'MCU model not available' };
    }
    getDigitalModel(g317: string): Result<string> {
        if (this.fileLoader) {
            return this.fileLoader.getDigitalModel(g317);
        }
        const h317 = this.components.get(g317);
        if (!h317)
            return { success: false, error: 'Component not found' };
        return { success: true, data: h317.behaviorModel };
    }
    getSvgSymbol(d317: string): Result<string> {
        if (this.fileLoader) {
            const f317 = this.fileLoader.getSvgSymbol(d317);
            if (f317.success)
                return f317;
        }
        const e317 = this.components.get(d317);
        if (!e317)
            return { success: false, error: 'Component not found' };
        return { success: true, data: e317.svgSymbol };
    }
    getErcRules(a317: string): Result<string[]> {
        const b317 = this.deviceMetas.get(a317);
        if (b317 !== undefined && b317.erc_check_rules !== undefined) {
            return { success: true, data: b317.erc_check_rules };
        }
        const c317 = this.getDeviceMeta(a317);
        if (c317.success && c317.data !== undefined && c317.data.erc_check_rules !== undefined) {
            return { success: true, data: c317.data.erc_check_rules };
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
    importComponent(z316: ComponentDefinition): Result<void> {
        this.components.set(z316.id, z316);
        return { success: true };
    }
    importFromJson(t316: string): Result<number> {
        try {
            const v316 = JSON.parse(t316) as ComponentDefinition[];
            let w316 = 0;
            for (let x316 = 0; x316 < v316.length; x316++) {
                const y316 = v316[x316];
                this.components.set(y316.id, y316);
                w316++;
            }
            return { success: true, data: w316 };
        }
        catch (u316) {
            return { success: false, error: `Invalid JSON: ${u316}` };
        }
    }
    batchUpdateParams(o316: string, p316: Map<string, string>): Result<number> {
        const q316 = this.components.get(o316);
        if (!q316)
            return { success: false, error: 'Component not found' };
        p316.forEach((r316: string, s316: string) => {
            q316.defaultParams.set(s316, r316);
        });
        return { success: true, data: 1 };
    }
    replaceComponents(k316: string, l316: string): Result<void> {
        const m316 = this.components.get(k316);
        const n316 = this.components.get(l316);
        if (!m316 || !n316)
            return { success: false, error: 'Component not found' };
        if (m316.category !== n316.category) {
            return { success: false, error: 'Category mismatch' };
        }
        this.components.delete(k316);
        return { success: true };
    }
    updateLibrary(d316: string): Result<number> {
        try {
            const f316 = fs.statSync(d316);
            if (f316.isDirectory()) {
                return this.initFromDeviceLibrary(d316);
            }
            const g316 = fs.openSync(d316, fs.OpenMode.READ_ONLY);
            const h316 = new ArrayBuffer(f316.size);
            fs.readSync(g316.fd, h316);
            fs.closeSync(g316);
            const i316 = arrayBufferToString(h316);
            const j316 = this.importFromJson(i316);
            if (j316.success && j316.data !== undefined) {
                this.version = `2.1.${j316.data}`;
                return { success: true, data: j316.data };
            }
            return { success: false, error: j316.error };
        }
        catch (e316) {
            return { success: false, error: `Library update failed: ${e316}` };
        }
    }
    getLibraryVersion(): string { return this.version; }
    getTotalCount(): number { return this.components.size; }
    getAllComponents(): ComponentDefinition[] { return Array.from(this.components.values()); }
    loadProteusAliases(b316: string): number {
        const c316 = this.aliasLoader.loadFromJson(b316);
        return c316;
    }
    resolveWithVendor(y315: string, z315: string = ''): string {
        const a316 = this.aliasLoader.resolve(y315, z315);
        return this.resolveLibraryId(a316);
    }
    resolveLibraryId(s315: string): string {
        if (this.components.has(s315))
            return s315;
        const t315 = this.aliasLoader.resolve(s315, '');
        if (t315 !== s315 && this.components.has(t315))
            return t315;
        const u315 = ComponentLibraryImpl.PROTEUS_ALIASES.get(s315.toUpperCase());
        if (u315 !== undefined && this.components.has(u315))
            return u315;
        if (s315 === 'STM32F103C8' && this.components.has('STM32F103C8T6'))
            return 'STM32F103C8T6';
        if (s315 === 'STM32F103C8T6' && this.components.has('STM32F103C8'))
            return 'STM32F103C8';
        const v315 = s315.toUpperCase();
        const w315 = Array.from(this.components.values());
        for (let x315 = 0; x315 < w315.length; x315++) {
            if (w315[x315].id.toUpperCase() === v315)
                return w315[x315].id;
        }
        return s315;
    }
    mapProteusDevId(r315: string): string {
        return this.resolveLibraryId(r315);
    }
    exportOfflinePack(q315: string): Result<string> {
        if (this.libraryRootPath.length === 0) {
            return { success: false, error: '器件库路径未初始化' };
        }
        return LibraryPackExporter.exportPack(this.libraryRootPath, q315);
    }
    importOfflinePack(o315: string): Result<number> {
        if (this.libraryRootPath.length === 0) {
            return { success: false, error: '器件库路径未初始化' };
        }
        const p315 = LibraryPackExporter.importPack(o315, this.libraryRootPath);
        if (p315.success && p315.data !== undefined && p315.data > 0) {
            return this.refreshIncremental();
        }
        return p315;
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
