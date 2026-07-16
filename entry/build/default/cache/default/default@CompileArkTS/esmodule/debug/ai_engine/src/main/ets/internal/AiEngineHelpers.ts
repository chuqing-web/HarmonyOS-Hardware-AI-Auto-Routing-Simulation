import { AiCapability, AiTaskType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Point2D, RouteLine, RouteResult, SchematicDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AlternativeEntry, BomPartCount, BomReplacementEntry, DevicePosition, PositionEntry, PromptVarEntry } from './AiEngineTypes';
export function getTaskCapability(taskType: AiTaskType): AiCapability | undefined {
    switch (taskType) {
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
export function getCategoriesForDevType(devType: string): string[] {
    switch (devType) {
        case 'ldo':
            return ['analog', 'passive', 'power_supply'];
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
        case 'led':
            return ['discrete', 'passive'];
        case 'lcd':
            return ['peripheral', 'display'];
        case 'opamp':
            return ['analog_ic', 'analog'];
        case 'digital':
            return ['digital_ic', 'digital_logic'];
        case 'sensor':
            return ['sensor'];
        case 'instrument':
        case 'oscilloscope':
        case 'voltmeter':
        case 'ammeter':
        case 'multimeter':
            return ['instrument'];
        case 'uart':
            return ['instrument', 'peripheral'];
        default:
            return [devType];
    }
}
export function getDomesticAlt(model: string): string | undefined {
    switch (model) {
        case 'STM32F103C8T6':
        case 'STM32F103C8':
            return 'GD32F103C8';
        case 'AT89C51':
            return 'STC89C52';
        default:
            return undefined;
    }
}
export function getPlacementPriority(devType: string, reqPriority: number): number {
    switch (devType) {
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
        case 'instrument':
        case 'oscilloscope':
        case 'voltmeter':
        case 'ammeter':
        case 'multimeter':
            return 45;
        case 'cap':
            return 40;
        case 'resistor':
            return 30;
        case 'led':
            return 35;
        default:
            return reqPriority * 10;
    }
}
export function copyStringMap(source: Map<string, string>): Map<string, string> {
    const copy = new Map<string, string>();
    source.forEach((value: string, key: string) => {
        copy.set(key, value);
    });
    return copy;
}
export function copyParamsFromRecord(source: Map<string, string>): Map<string, string> {
    return copyStringMap(source);
}
export function paramsMapToRecord(source: Map<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    source.forEach((value: string, key: string) => {
        result[key] = value;
    });
    return result;
}
export function alternativesToRecord(entries: AlternativeEntry[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        result[entry.libDevId] = entry.alternatives;
    }
    return result;
}
export function alternativesToMap(entries: AlternativeEntry[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        result.set(entry.libDevId, entry.alternatives);
    }
    return result;
}
export function buildNetPriorityMap(topoNetNames: string[], topoFlags: NetPriorityHint[]): Map<string, number> {
    const priorities = new Map<string, number>();
    priorities.set('GND', 10);
    priorities.set('VCC', 10);
    priorities.set('VDD', 10);
    priorities.set('3V3', 10);
    for (let i = 0; i < topoFlags.length; i++) {
        const hint = topoFlags[i];
        if (hint.isClock) {
            priorities.set(hint.netName, 9);
        }
        else if (hint.isAnalog) {
            priorities.set(hint.netName, 7);
        }
        else if (hint.isPower) {
            priorities.set(hint.netName, 10);
        }
        else if (!priorities.has(hint.netName)) {
            priorities.set(hint.netName, 2);
        }
    }
    return priorities;
}
export interface NetPriorityHint {
    netName: string;
    isPower: boolean;
    isAnalog: boolean;
    isClock: boolean;
}
export function netPriorityMapToRecord(source: Map<string, number>): Record<string, number> {
    const result: Record<string, number> = {};
    source.forEach((value: number, key: string) => {
        result[key] = value;
    });
    return result;
}
export function getNetPriorityValue(priorities: Record<string, number>, netName: string, nameUp: string, isPower: boolean, isAnalog: boolean): number {
    const directVal = priorities[netName];
    if (directVal !== undefined) {
        return directVal;
    }
    const upperVal = priorities[nameUp];
    if (upperVal !== undefined) {
        return upperVal;
    }
    if (isPower) {
        return 10;
    }
    if (isAnalog) {
        return 7;
    }
    return 2;
}
export function positionsToRecord(entries: PositionEntry[]): Record<string, DevicePosition> {
    const result: Record<string, DevicePosition> = {};
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        result[entry.deviceId] = entry.position;
    }
    return result;
}
export function positionsFromChromosome(chrom: Map<string, GeneLike>): PositionEntry[] {
    const entries: PositionEntry[] = [];
    chrom.forEach((gene: GeneLike, deviceId: string) => {
        entries.push({
            deviceId,
            position: { x: gene.x, y: gene.y, rotate: gene.rotate }
        });
    });
    return entries;
}
export interface GeneLike {
    x: number;
    y: number;
    rotate: number;
}
export function cloneGene(gene: GeneLike): GeneLike {
    return { x: gene.x, y: gene.y, rotate: gene.rotate };
}
export function arrayMin(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    let min = values[0];
    for (let i = 1; i < values.length; i++) {
        if (values[i] < min) {
            min = values[i];
        }
    }
    return min;
}
export function arrayMax(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
        if (values[i] > max) {
            max = values[i];
        }
    }
    return max;
}
export function arraySum(values: number[]): number {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum;
}
export function concatStringArrays(first: string[], second: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < first.length; i++) {
        result.push(first[i]);
    }
    for (let i = 0; i < second.length; i++) {
        result.push(second[i]);
    }
    return result;
}
export function cloneStringArray(source: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function cloneLabTemplateArray<T>(source: T[]): T[] {
    const result: T[] = [];
    for (let i = 0; i < source.length; i++) {
        result.push(source[i]);
    }
    return result;
}
export function filterSchematicComponents(doc: SchematicDocument, devUuids: string[]): SchematicDocument {
    const filteredComponents = doc.components.filter(c => devUuids.includes(c.id));
    return {
        id: doc.id,
        name: doc.name,
        version: doc.version,
        components: filteredComponents,
        wires: doc.wires,
        nets: doc.nets,
        netLabels: doc.netLabels,
        subcircuits: doc.subcircuits,
        metadata: doc.metadata
    };
}
export function countSignalKeys(signals: Map<string, number[]>): number {
    let count = 0;
    signals.forEach((_data: number[], _name: string) => {
        count++;
    });
    return count;
}
export function iterateSignalEntries(signals: Map<string, number[]>, callback: (name: string, data: number[]) => void): void {
    signals.forEach((data: number[], name: string) => {
        callback(name, data);
    });
}
export function joinParamConstraintValues(params: Map<string, string>): string {
    const parts: string[] = [];
    params.forEach((value: string, _key: string) => {
        parts.push(value);
    });
    return parts.join(' ');
}
export function applyPromptVars(template: string, vars: PromptVarEntry[]): string {
    let user = template;
    for (let i = 0; i < vars.length; i++) {
        const entry = vars[i];
        user = user.replace(new RegExp(`\\{\\{${entry.key}\\}\\}`, 'g'), entry.value);
    }
    return user;
}
export function buildBomCounts(deviceLibIds: string[]): BomPartCount[] {
    const counts = new Map<string, number>();
    for (let i = 0; i < deviceLibIds.length; i++) {
        const part = deviceLibIds[i];
        counts.set(part, (counts.get(part) ?? 0) + 1);
    }
    const result: BomPartCount[] = [];
    counts.forEach((count: number, libDevId: string) => {
        result.push({ libDevId, count });
    });
    return result;
}
export function buildBomReplacements(bom: BomPartCount[]): BomReplacementEntry[] {
    const replacements: BomReplacementEntry[] = [];
    for (let i = 0; i < bom.length; i++) {
        const part = bom[i];
        if (part.libDevId.startsWith('STM32')) {
            replacements.push({ original: part.libDevId, replacement: 'GD32F103C8' });
        }
    }
    return replacements;
}
export function replacementsToRecord(entries: BomReplacementEntry[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        result[entry.original] = entry.replacement;
    }
    return result;
}
export function replacementsToMap(entries: BomReplacementEntry[]): Map<string, string> {
    const result = new Map<string, string>();
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        result.set(entry.original, entry.replacement);
    }
    return result;
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
export function moduleGroupToRecord(groups: ModuleGroupLists): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    result['mcu_core'] = groups.mcuCore;
    result['power'] = groups.power;
    result['peripheral'] = groups.peripheral;
    return result;
}
export function getModuleGroupValues(groups: Record<string, string[]>): string[][] {
    const result: string[][] = [];
    const keys = Object.keys(groups);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const group = groups[key] as string[];
        if (group) {
            result.push(group);
        }
    }
    return result;
}
export function cloneRouteResult(route: RouteResult): RouteResult {
    const routeLines: RouteLine[] = [];
    for (let i = 0; i < route.routeLines.length; i++) {
        const line = route.routeLines[i];
        const cloned: RouteLine = {
            netUuid: line.netUuid,
            points: clonePointList(line.points),
            isBus: line.isBus
        };
        routeLines.push(cloned);
    }
    const result: RouteResult = {
        routeLines: routeLines,
        crossCount: route.crossCount,
        totalLineLength: route.totalLineLength,
        isolateAnalogDigital: route.isolateAnalogDigital,
        xtalShortPath: route.xtalShortPath,
        diffLineEqualLength: route.diffLineEqualLength
    };
    return result;
}
function clonePointList(points: Point2D[]): Point2D[] {
    const result: Point2D[] = [];
    for (let i = 0; i < points.length; i++) {
        result.push({ x: points[i].x, y: points[i].y });
    }
    return result;
}
export function clonePointArray(points: Point2D[]): Point2D[] {
    return clonePointList(points);
}
