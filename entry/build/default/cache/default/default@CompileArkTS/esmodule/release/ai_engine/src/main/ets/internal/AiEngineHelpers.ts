import { AiCapability, AiTaskType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Point2D, RouteLine, RouteResult, SchematicDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AlternativeEntry, BomPartCount, BomReplacementEntry, DevicePosition, PositionEntry, PromptVarEntry } from './AiEngineTypes';
export function getTaskCapability(d313: AiTaskType): AiCapability | undefined {
    switch (d313) {
        case AiTaskType.TASK_AUTO_ROUTE_GLOBAL:
        case AiTaskType.TASK_AUTO_ROUTE_SELECT:
        case AiTaskType.TASK_ROUTE_OPTIMIZE:
        case AiTaskType.TASK_LAYOUT_PLACE:
            return AiCapability.AUTO_WIRING;
        case AiTaskType.TASK_CIRCUIT_DIAG_STATIC:
        case AiTaskType.TASK_CIRCUIT_DIAG_DYNAMIC:
            return AiCapability.FAULT_DIAGNOSIS;
        case AiTaskType.TASK_GEN_SCH_FULL:
        case AiTaskType.TASK_GEN_SUB_CIRCUIT:
        case AiTaskType.TASK_FULL_PIPELINE:
            return AiCapability.CIRCUIT_GENERATION;
        case AiTaskType.TASK_WAVE_ANALYZE:
            return AiCapability.WAVEFORM_ANALYSIS;
        case AiTaskType.TASK_COMPONENT_REC:
        case AiTaskType.TASK_COMPONENT_REPLACE:
        case AiTaskType.TASK_BOM_OPTIMIZE:
        case AiTaskType.TASK_DEVICE_SELECT:
            return AiCapability.COMPONENT_RECOMMEND;
        default:
            return undefined;
    }
}
export function getAllAiCapabilities(): AiCapability[] {
    return [
        AiCapability.AUTO_WIRING,
        AiCapability.FAULT_DIAGNOSIS,
        AiCapability.CIRCUIT_GENERATION,
        AiCapability.WAVEFORM_ANALYSIS,
        AiCapability.COMPONENT_RECOMMEND
    ];
}
export function getCategoriesForDevType(c313: string): string[] {
    switch (c313) {
        case 'ldo':
            return ['analog', 'passive'];
        case 'mcu_stm32':
            return ['mcu_stm32', 'mcu'];
        case 'mcu_51':
            return ['mcu_8051', 'mcu'];
        case 'mcu':
            return ['mcu_stm32', 'mcu_8051', 'mcu'];
        case 'crystal':
            return ['passive', 'discrete'];
        case 'cap':
            return ['passive'];
        case 'resistor':
            return ['passive'];
        case 'lcd':
            return ['peripheral', 'display'];
        case 'opamp':
            return ['analog_ic', 'analog'];
        case 'digital':
            return ['digital_ic', 'digital_logic'];
        default:
            return [c313];
    }
}
export function getDomesticAlt(b313: string): string | undefined {
    switch (b313) {
        case 'STM32F103C8T6':
        case 'STM32F103C8':
            return 'GD32F103C8';
        case 'AT89C51':
            return 'STC89C52';
        default:
            return undefined;
    }
}
export function getPlacementPriority(z312: string, a313: number): number {
    switch (z312) {
        case 'mcu':
        case 'mcu_stm32':
        case 'mcu_51':
            return 100;
        case 'crystal':
            return 90;
        case 'ldo':
            return 70;
        case 'lcd':
            return 50;
        case 'cap':
            return 40;
        case 'resistor':
            return 30;
        default:
            return a313 * 10;
    }
}
export function copyStringMap(v312: Map<string, string>): Map<string, string> {
    const w312 = new Map<string, string>();
    v312.forEach((x312: string, y312: string) => {
        w312.set(y312, x312);
    });
    return w312;
}
export function copyParamsFromRecord(u312: Map<string, string>): Map<string, string> {
    return copyStringMap(u312);
}
export function paramsMapToRecord(q312: Map<string, string>): Record<string, string> {
    const r312: Record<string, string> = {};
    q312.forEach((s312: string, t312: string) => {
        r312[t312] = s312;
    });
    return r312;
}
export function alternativesToRecord(m312: AlternativeEntry[]): Record<string, string[]> {
    const n312: Record<string, string[]> = {};
    for (let o312 = 0; o312 < m312.length; o312++) {
        const p312 = m312[o312];
        n312[p312.libDevId] = p312.alternatives;
    }
    return n312;
}
export function alternativesToMap(i312: AlternativeEntry[]): Map<string, string[]> {
    const j312 = new Map<string, string[]>();
    for (let k312 = 0; k312 < i312.length; k312++) {
        const l312 = i312[k312];
        j312.set(l312.libDevId, l312.alternatives);
    }
    return j312;
}
export function buildNetPriorityMap(d312: string[], e312: NetPriorityHint[]): Map<string, number> {
    const f312 = new Map<string, number>();
    f312.set('GND', 10);
    f312.set('VCC', 10);
    f312.set('VDD', 10);
    f312.set('3V3', 10);
    for (let g312 = 0; g312 < e312.length; g312++) {
        const h312 = e312[g312];
        if (h312.isClock) {
            f312.set(h312.netName, 9);
        }
        else if (h312.isAnalog) {
            f312.set(h312.netName, 7);
        }
        else if (h312.isPower) {
            f312.set(h312.netName, 10);
        }
        else if (!f312.has(h312.netName)) {
            f312.set(h312.netName, 2);
        }
    }
    return f312;
}
export interface NetPriorityHint {
    netName: string;
    isPower: boolean;
    isAnalog: boolean;
    isClock: boolean;
}
export function netPriorityMapToRecord(z311: Map<string, number>): Record<string, number> {
    const a312: Record<string, number> = {};
    z311.forEach((b312: number, c312: string) => {
        a312[c312] = b312;
    });
    return a312;
}
export function getNetPriorityValue(s311: Record<string, number>, t311: string, u311: string, v311: boolean, w311: boolean): number {
    const x311 = s311[t311];
    if (x311 !== undefined) {
        return x311;
    }
    const y311 = s311[u311];
    if (y311 !== undefined) {
        return y311;
    }
    if (v311) {
        return 10;
    }
    if (w311) {
        return 7;
    }
    return 2;
}
export function positionsToRecord(o311: PositionEntry[]): Record<string, DevicePosition> {
    const p311: Record<string, DevicePosition> = {};
    for (let q311 = 0; q311 < o311.length; q311++) {
        const r311 = o311[q311];
        p311[r311.deviceId] = r311.position;
    }
    return p311;
}
export function positionsFromChromosome(k311: Map<string, GeneLike>): PositionEntry[] {
    const l311: PositionEntry[] = [];
    k311.forEach((m311: GeneLike, n311: string) => {
        l311.push({
            deviceId: n311,
            position: { x: m311.x, y: m311.y, rotate: m311.rotate }
        });
    });
    return l311;
}
export interface GeneLike {
    x: number;
    y: number;
    rotate: number;
}
export function cloneGene(j311: GeneLike): GeneLike {
    return { x: j311.x, y: j311.y, rotate: j311.rotate };
}
export function arrayMin(g311: number[]): number {
    if (g311.length === 0) {
        return 0;
    }
    let h311 = g311[0];
    for (let i311 = 1; i311 < g311.length; i311++) {
        if (g311[i311] < h311) {
            h311 = g311[i311];
        }
    }
    return h311;
}
export function arrayMax(d311: number[]): number {
    if (d311.length === 0) {
        return 0;
    }
    let e311 = d311[0];
    for (let f311 = 1; f311 < d311.length; f311++) {
        if (d311[f311] > e311) {
            e311 = d311[f311];
        }
    }
    return e311;
}
export function arraySum(a311: number[]): number {
    let b311 = 0;
    for (let c311 = 0; c311 < a311.length; c311++) {
        b311 += a311[c311];
    }
    return b311;
}
export function concatStringArrays(v310: string[], w310: string[]): string[] {
    const x310: string[] = [];
    for (let z310 = 0; z310 < v310.length; z310++) {
        x310.push(v310[z310]);
    }
    for (let y310 = 0; y310 < w310.length; y310++) {
        x310.push(w310[y310]);
    }
    return x310;
}
export function cloneStringArray(s310: string[]): string[] {
    const t310: string[] = [];
    for (let u310 = 0; u310 < s310.length; u310++) {
        t310.push(s310[u310]);
    }
    return t310;
}
export function cloneLabTemplateArray<o310>(p310: o310[]): o310[] {
    const q310: o310[] = [];
    for (let r310 = 0; r310 < p310.length; r310++) {
        q310.push(p310[r310]);
    }
    return q310;
}
export function filterSchematicComponents(k310: SchematicDocument, l310: string[]): SchematicDocument {
    const m310 = k310.components.filter(n310 => l310.includes(n310.id));
    return {
        id: k310.id,
        name: k310.name,
        version: k310.version,
        components: m310,
        wires: k310.wires,
        nets: k310.nets,
        netLabels: k310.netLabels,
        subcircuits: k310.subcircuits,
        metadata: k310.metadata
    };
}
export function countSignalKeys(g310: Map<string, number[]>): number {
    let h310 = 0;
    g310.forEach((i310: number[], j310: string) => {
        h310++;
    });
    return h310;
}
export function iterateSignalEntries(c310: Map<string, number[]>, d310: (name: string, data: number[]) => void): void {
    c310.forEach((e310: number[], f310: string) => {
        d310(f310, e310);
    });
}
export function joinParamConstraintValues(y309: Map<string, string>): string {
    const z309: string[] = [];
    y309.forEach((a310: string, b310: string) => {
        z309.push(a310);
    });
    return z309.join(' ');
}
export function applyPromptVars(t309: string, u309: PromptVarEntry[]): string {
    let v309 = t309;
    for (let w309 = 0; w309 < u309.length; w309++) {
        const x309 = u309[w309];
        v309 = v309.replace(new RegExp(`\\{\\{${x309.key}\\}\\}`, 'g'), x309.value);
    }
    return v309;
}
export function buildBomCounts(m309: string[]): BomPartCount[] {
    const n309 = new Map<string, number>();
    for (let r309 = 0; r309 < m309.length; r309++) {
        const s309 = m309[r309];
        n309.set(s309, (n309.get(s309) ?? 0) + 1);
    }
    const o309: BomPartCount[] = [];
    n309.forEach((p309: number, q309: string) => {
        o309.push({ libDevId: q309, count: p309 });
    });
    return o309;
}
export function buildBomReplacements(i309: BomPartCount[]): BomReplacementEntry[] {
    const j309: BomReplacementEntry[] = [];
    for (let k309 = 0; k309 < i309.length; k309++) {
        const l309 = i309[k309];
        if (l309.libDevId.startsWith('STM32')) {
            j309.push({ original: l309.libDevId, replacement: 'GD32F103C8' });
        }
    }
    return j309;
}
export function replacementsToRecord(e309: BomReplacementEntry[]): Record<string, string> {
    const f309: Record<string, string> = {};
    for (let g309 = 0; g309 < e309.length; g309++) {
        const h309 = e309[g309];
        f309[h309.original] = h309.replacement;
    }
    return f309;
}
export function replacementsToMap(a309: BomReplacementEntry[]): Map<string, string> {
    const b309 = new Map<string, string>();
    for (let c309 = 0; c309 < a309.length; c309++) {
        const d309 = a309[c309];
        b309.set(d309.original, d309.replacement);
    }
    return b309;
}
export function getModuleGroupLists(): ModuleGroupLists {
    return {
        mcuCore: [],
        power: [],
        peripheral: []
    };
}
export interface ModuleGroupLists {
    mcuCore: string[];
    power: string[];
    peripheral: string[];
}
export function moduleGroupToRecord(y308: ModuleGroupLists): Record<string, string[]> {
    const z308: Record<string, string[]> = {};
    z308['mcu_core'] = y308.mcuCore;
    z308['power'] = y308.power;
    z308['peripheral'] = y308.peripheral;
    return z308;
}
export function getModuleGroupValues(s308: Record<string, string[]>): string[][] {
    const t308: string[][] = [];
    const u308 = Object.keys(s308);
    for (let v308 = 0; v308 < u308.length; v308++) {
        const w308 = u308[v308];
        const x308 = s308[w308] as string[];
        if (x308) {
            t308.push(x308);
        }
    }
    return t308;
}
export function cloneRouteResult(m308: RouteResult): RouteResult {
    const n308: RouteLine[] = [];
    for (let p308 = 0; p308 < m308.routeLines.length; p308++) {
        const q308 = m308.routeLines[p308];
        const r308: RouteLine = {
            netUuid: q308.netUuid,
            points: clonePointList(q308.points),
            isBus: q308.isBus
        };
        n308.push(r308);
    }
    const o308: RouteResult = {
        routeLines: n308,
        crossCount: m308.crossCount,
        totalLineLength: m308.totalLineLength,
        isolateAnalogDigital: m308.isolateAnalogDigital,
        xtalShortPath: m308.xtalShortPath,
        diffLineEqualLength: m308.diffLineEqualLength
    };
    return o308;
}
function clonePointList(j308: Point2D[]): Point2D[] {
    const k308: Point2D[] = [];
    for (let l308 = 0; l308 < j308.length; l308++) {
        k308.push({ x: j308[l308].x, y: j308[l308].y });
    }
    return k308;
}
export function clonePointArray(i308: Point2D[]): Point2D[] {
    return clonePointList(i308);
}
