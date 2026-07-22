import { Logger } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/Logger";
import type { WaveData } from '../types/SimExtendedTypes';
import type { SchematicDocument, ComponentInstance, Net, Wire, ViewportState, SimulationState } from '../types/CommonTypes';
import type { ErcError } from '../types/TopologyTypes';
import type { HexFileInfo } from '../types/HexExtendedTypes';
import { parsePinRef, getPinNetMap } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/PinRefUtil";
import { isInstrumentLibraryId, detectInstrumentKind } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/InstrumentKindUtil";
export const INSTR_TRACE_TAG = 'instr_trace';
/** 是否输出逐步仿真采样日志（默认关闭，避免刷屏） */
export let INSTR_TRACE_SIM_STEP = false;
export function setInstrTraceSimStep(enabled: boolean): void {
    INSTR_TRACE_SIM_STEP = enabled;
}
export function formatPinNetMap(pinNets: Map<string, string>, maxEntries: number = 12): string {
    const parts: string[] = [];
    let count = 0;
    pinNets.forEach((netId: string, pin: string) => {
        if (count >= maxEntries) {
            return;
        }
        parts.push(`${pin}->${netId}`);
        count++;
    });
    if (pinNets.size > maxEntries) {
        parts.push(`...+${pinNets.size - maxEntries}`);
    }
    return parts.length > 0 ? parts.join(', ') : '(empty)';
}
export interface BindingTraceInfo {
    libraryId: string;
    scopeProbes: string[];
    logicProbes: string[];
    hasVoltageReader: boolean;
    hasCurrentReader: boolean;
    hasPowerVoltageReader: boolean;
    hasPowerCurrentReader: boolean;
    hasFreqReader: boolean;
}
export function formatBindingSummary(binding: BindingTraceInfo): string {
    const readers: string[] = [];
    if (binding.hasVoltageReader)
        readers.push('V');
    if (binding.hasCurrentReader)
        readers.push('I');
    if (binding.hasPowerVoltageReader)
        readers.push('PV');
    if (binding.hasPowerCurrentReader)
        readers.push('PI');
    if (binding.hasFreqReader)
        readers.push('F');
    const scope = binding.scopeProbes.filter(p => p.length > 0).join('|');
    const logic = binding.logicProbes.join('|');
    return `lib=${binding.libraryId} scope=[${scope}] logic=[${logic}] readers=[${readers.join(',')}]`;
}
export function formatWaveSummary(waves: WaveData[], maxWaves: number = 6): string {
    const parts: string[] = [];
    const limit = Math.min(waves.length, maxWaves);
    for (let i = 0; i < limit; i++) {
        const w = waves[i];
        const pts = w.voltageAxis.length;
        const lastV = pts > 0 ? w.voltageAxis[pts - 1].toFixed(4) : '0';
        parts.push(`${w.probeName}/${w.netName}:${pts}pt@${lastV}V`);
    }
    if (waves.length > maxWaves) {
        parts.push(`...+${waves.length - maxWaves}`);
    }
    return parts.length > 0 ? parts.join('; ') : '(no waves)';
}
export function formatVoltageSample(voltages: Map<string, number>, maxEntries: number = 8): string {
    const parts: string[] = [];
    let count = 0;
    voltages.forEach((v: number, key: string) => {
        if (count >= maxEntries) {
            return;
        }
        if (Math.abs(v) > 1e-12 || key === 'VCC' || key === 'GND' || key === '0') {
            parts.push(`${key}=${v.toFixed(4)}V`);
            count++;
        }
    });
    return parts.length > 0 ? parts.join(', ') : '(all ~0)';
}
export function formatCurrentSample(currents: Map<string, number>, maxEntries: number = 8): string {
    const parts: string[] = [];
    let count = 0;
    currents.forEach((i: number, key: string) => {
        if (count >= maxEntries) {
            return;
        }
        if (Math.abs(i) > 1e-15) {
            parts.push(`${key}=${(i * 1000).toFixed(4)}mA`);
            count++;
        }
    });
    return parts.length > 0 ? parts.join(', ') : '(all ~0)';
}
function refDesForComp(components: ComponentInstance[], compId: string): string {
    for (let i = 0; i < components.length; i++) {
        if (components[i].id === compId) {
            return components[i].refDes;
        }
    }
    return compId.length > 10 ? compId.substring(0, 10) : compId;
}
function netDisplayName(net: Net): string {
    return net.name.length > 0 ? net.name : net.id;
}
/** 数据流阶段标记 */
export function traceDataFlow(stage: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[FLOW] ${stage} | ${detail}`);
}
/** 数字门 DC 种子 / 门级状态（lab_digital） */
export function traceDigitalLogic(stage: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[DIGITAL] ${stage} | ${detail}`);
}
/** A→D / CD4017 时钟排查（电平变化或显式 force 时打 info） */
export function traceDigitalAd(detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[DIGITAL] A2D | ${detail}`);
}
/** A→D 周期快照（默认 ~5Hz，避免刷屏） */
let _adSnapLastMs = 0;
export function traceDigitalAdSnapshot(detail: string, minIntervalMs: number = 200): void {
    const now = Date.now();
    if (now - _adSnapLastMs < minIntervalMs && !INSTR_TRACE_SIM_STEP) {
        return;
    }
    _adSnapLastMs = now;
    Logger.info(INSTR_TRACE_TAG, `[DIGITAL] A2D_SNAP | ${detail}`);
}
/** CD4017 边沿 / 阻塞原因 */
export function traceCd4017(detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[DIGITAL] CD4017 | ${detail}`);
}
/** 数字→模拟 Thevenin 注入摘要 */
export function traceDigitalThevenin(parts: string[]): void {
    // Empty THEV every sim frame floods instr_trace on analog-only labs — skip.
    if (parts.length === 0) {
        return;
    }
    Logger.info(INSTR_TRACE_TAG, `[DIGITAL] THEV | ${parts.join('; ')}`);
}
/** 逻辑分析仪通道读数 */
export function traceLogicAnalyzerChannels(refDes: string, channels: string[]): void {
    if (channels.length === 0) {
        Logger.info(INSTR_TRACE_TAG, `[LA] ${refDes} | (no channels bound)`);
        return;
    }
    Logger.info(INSTR_TRACE_TAG, `[LA] ${refDes} | ${channels.join(' ')}`);
}
/** LA 捕获路径：probe 匹配 / 边沿数 / 电压跨度（限流） */
let _laCaptureLastMs: number = 0;
export function traceLaCapture(detail: string, minIntervalMs: number = 400): void {
    const now = Date.now();
    if (now - _laCaptureLastMs < minIntervalMs) {
        return;
    }
    _laCaptureLastMs = now;
    Logger.info(INSTR_TRACE_TAG, `[LA] CAPTURE | ${detail}`);
}
/** LA UI 刷新：各通道边沿摘要（限流） */
let _laUiLastMs: number = 0;
export function traceLaUiChannels(detail: string, minIntervalMs: number = 500): void {
    const now = Date.now();
    if (now - _laUiLastMs < minIntervalMs) {
        return;
    }
    _laUiLastMs = now;
    Logger.info(INSTR_TRACE_TAG, `[LA] UI | ${detail}`);
}
/** 画布/视口信息 */
export function traceCanvasInfo(doc: SchematicDocument, viewport: ViewportState): void {
    Logger.info(INSTR_TRACE_TAG, `[CANVAS] doc=${doc.name} grid=${viewport.gridSize} zoom=${viewport.zoom.toFixed(2)} ` +
        `pan=(${viewport.panOffset.x.toFixed(0)},${viewport.panOffset.y.toFixed(0)}) ` +
        `snap=${viewport.snapToGrid} units=${doc.metadata.units} wires=${doc.wires.length} labels=${doc.netLabels.length}`);
}
/** 器件排布信息 */
export function traceComponentLayout(components: ComponentInstance[], maxComps: number = 30): void {
    Logger.info(INSTR_TRACE_TAG, `[LAYOUT] total=${components.length}`);
    const limit = Math.min(components.length, maxComps);
    for (let i = 0; i < limit; i++) {
        const c = components[i];
        const paramKeys: string[] = [];
        c.parameters.forEach((_v: string, k: string) => {
            if (paramKeys.length < 3) {
                paramKeys.push(k);
            }
        });
        const paramHint = paramKeys.length > 0 ? ` params=[${paramKeys.join(',')}...]` : '';
        Logger.info(INSTR_TRACE_TAG, `[LAYOUT] #${i + 1} ref=${c.refDes} lib=${c.libraryId} id=${c.id} ` +
            `pos=(${c.position.x.toFixed(0)},${c.position.y.toFixed(0)}) rot=${c.rotation} mir=${c.mirrored}${paramHint}`);
    }
    if (components.length > maxComps) {
        Logger.info(INSTR_TRACE_TAG, `[LAYOUT] ...+${components.length - maxComps} more components`);
    }
}
/** 导线拓扑摘要 */
export function traceWireTopology(wires: Wire[], maxWires: number = 15): void {
    Logger.info(INSTR_TRACE_TAG, `[WIRES] total=${wires.length}`);
    const limit = Math.min(wires.length, maxWires);
    for (let i = 0; i < limit; i++) {
        const w = wires[i];
        const pts = w.points.length;
        const start = pts > 0 ? `(${w.points[0].x.toFixed(0)},${w.points[0].y.toFixed(0)})` : '?';
        const end = pts > 1 ? `(${w.points[pts - 1].x.toFixed(0)},${w.points[pts - 1].y.toFixed(0)})` : start;
        Logger.info(INSTR_TRACE_TAG, `[WIRES] #${i + 1} id=${w.id} net=${w.netId} pts=${pts} ${start}->${end}`);
    }
    if (wires.length > maxWires) {
        Logger.info(INSTR_TRACE_TAG, `[WIRES] ...+${wires.length - maxWires} more wires`);
    }
}
/** 网络/引脚连接详情 */
export function traceNetPinDetail(doc: SchematicDocument, maxNets: number = 25): void {
    const components = doc.components;
    let connectedNets = 0;
    let emptyNets = 0;
    for (let i = 0; i < doc.nets.length; i++) {
        if (doc.nets[i].pinIds.length > 0) {
            connectedNets++;
        }
        else {
            emptyNets++;
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[NETS] total=${doc.nets.length} connected=${connectedNets} empty=${emptyNets}`);
    let shown = 0;
    for (let i = 0; i < doc.nets.length && shown < maxNets; i++) {
        const net = doc.nets[i];
        if (net.pinIds.length === 0) {
            continue;
        }
        const pinParts: string[] = [];
        const pinLimit = Math.min(net.pinIds.length, 10);
        for (let pi = 0; pi < pinLimit; pi++) {
            const parsed = parsePinRef(net.pinIds[pi]);
            if (parsed !== null) {
                const ref = refDesForComp(components, parsed.compId);
                pinParts.push(`${ref}.${parsed.pinName.length > 0 ? parsed.pinName : parsed.pinId}`);
            }
        }
        const overflow = net.pinIds.length > pinLimit ? `...+${net.pinIds.length - pinLimit}` : '';
        Logger.info(INSTR_TRACE_TAG, `[NETS] net=${netDisplayName(net)} id=${net.id} type=${net.type} pins=[${pinParts.join(', ')}${overflow}]`);
        shown++;
    }
    if (connectedNets > maxNets) {
        Logger.info(INSTR_TRACE_TAG, `[NETS] ...+${connectedNets - maxNets} more connected nets`);
    }
}
/** 未连接引脚的器件告警 */
export function traceUnconnectedComponents(doc: SchematicDocument): void {
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        const pinNets = getPinNetMap(comp.id, doc.nets);
        if (pinNets.size === 0) {
            Logger.warn(INSTR_TRACE_TAG, `[CONNECT] UNCONNECTED ref=${comp.refDes} lib=${comp.libraryId} id=${comp.id} — no pin→net mapping`);
        }
    }
}
/** 仪器器件清单及引脚映射 */
export function traceInstrumentInventory(doc: SchematicDocument): void {
    let count = 0;
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        if (!isInstrumentLibraryId(comp.libraryId)) {
            continue;
        }
        count++;
        const kind = detectInstrumentKind(comp.libraryId);
        const pinNets = getPinNetMap(comp.id, doc.nets);
        Logger.info(INSTR_TRACE_TAG, `[INSTR] #${count} ref=${comp.refDes} lib=${comp.libraryId} kind=${kind} ` +
            `pins={${formatPinNetMap(pinNets, 16)}}`);
    }
    if (count === 0) {
        Logger.info(INSTR_TRACE_TAG, '[INSTR] (no instrument components on schematic)');
    }
    else {
        Logger.info(INSTR_TRACE_TAG, `[INSTR] total=${count} instrument components`);
    }
}
/** 仪器 V+/COM 或 I+/I- 接在同一 net 上 */
export function traceInstrumentWiringIssues(doc: SchematicDocument): void {
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        if (!isInstrumentLibraryId(comp.libraryId)) {
            continue;
        }
        const pinNets = getPinNetMap(comp.id, doc.nets);
        const netName = (netId: string): string => {
            const net = doc.nets.find(n => n.id === netId);
            return net !== undefined && net.name.length > 0 ? net.name : netId.substring(0, 14);
        };
        const findNet = (labels: string[]): string | null => {
            for (let li = 0; li < labels.length; li++) {
                const n = pinNets.get(labels[li].toUpperCase());
                if (n !== undefined) {
                    return n;
                }
            }
            return null;
        };
        const kind = detectInstrumentKind(comp.libraryId);
        if (kind === 'vm' || kind === 'dmm') {
            const vPlus = findNet(['V+', 'V', 'PLUS', '+', 'A', 'PROBE1']);
            const vCom = findNet(['COM', 'V-', '-', 'GND', 'B', 'PROBE2']);
            if (vPlus !== null && vCom !== null && vPlus === vCom) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_SHORT] ${comp.refDes} V+ and COM on same net ${netName(vPlus)} — reading will be 0V`);
            }
        }
        else if (kind === 'am') {
            const iPlus = findNet(['I+', 'PLUS', '+', 'A']);
            const iMinus = findNet(['I-', 'MINUS', '-', 'B', 'COM']);
            if (iPlus !== null && iMinus !== null && iPlus === iMinus) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_SHORT] ${comp.refDes} I+ and I- on same net ${netName(iPlus)} — reading will be 0A`);
            }
        }
        else if (kind === 'power') {
            const vPlus = findNet(['V+', 'VP', 'PLUS', '+']);
            const vMinus = findNet(['V-', 'COM', 'GND', '-']);
            const iPlus = findNet(['I+', 'IP']);
            const iMinus = findNet(['I-', 'IM']);
            if (vPlus !== null && vMinus !== null && vPlus === vMinus) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_SHORT] ${comp.refDes} V+/V- on same net ${netName(vPlus)} — power V=0`);
            }
            if (iPlus !== null && iMinus !== null && iPlus === iMinus) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_SHORT] ${comp.refDes} I+/I- on same net ${netName(iPlus)} — not series`);
            }
            else if (iPlus !== null && iMinus !== null && vPlus !== null && vMinus !== null &&
                iPlus === vPlus && iMinus === vMinus) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_WIRING] ${comp.refDes} I path identical to V path — current not series-inserted`);
            }
        }
        else if (kind === 'freq' || kind === 'osc' || kind === 'logic') {
            const sig = kind === 'freq' ? findNet(['IN', 'SIG', 'INPUT']) : findNet(['CH1', 'IN1', '1']);
            const gnd = findNet(['GND', 'COM', 'VSS']);
            if (sig !== null && gnd !== null && sig === gnd) {
                Logger.warn(INSTR_TRACE_TAG, `[INSTR_SHORT] ${comp.refDes} signal and GND on same net ${netName(sig)}`);
            }
        }
    }
}
/** 同一器件引脚出现在多个 net 上 */
export function tracePinMultiNetConflicts(doc: SchematicDocument): void {
    const pinToNets = new Map<string, string[]>();
    for (let ni = 0; ni < doc.nets.length; ni++) {
        const net = doc.nets[ni];
        for (let pi = 0; pi < net.pinIds.length; pi++) {
            const parsed = parsePinRef(net.pinIds[pi]);
            if (parsed === null) {
                continue;
            }
            const key = `${parsed.compId}:${parsed.pinName.length > 0 ? parsed.pinName : parsed.pinId}`;
            const list = pinToNets.get(key) ?? [];
            if (!list.includes(net.id)) {
                list.push(net.id);
                pinToNets.set(key, list);
            }
        }
    }
    let conflictCount = 0;
    pinToNets.forEach((netIds: string[], key: string) => {
        if (netIds.length <= 1) {
            return;
        }
        conflictCount++;
        const parts = key.split(':');
        const ref = refDesForComp(doc.components, parts[0]);
        const pin = parts.length > 1 ? parts[1] : '?';
        const netNames = netIds.map(id => {
            const net = doc.nets.find(n => n.id === id);
            return net !== undefined ? netDisplayName(net) : id.substring(0, 12);
        });
        Logger.warn(INSTR_TRACE_TAG, `[PIN_CONFLICT] ${ref}.${pin} on ${netIds.length} nets: [${netNames.join(', ')}]`);
    });
    if (conflictCount === 0) {
        Logger.info(INSTR_TRACE_TAG, '[PIN_CONFLICT] (none detected)');
    }
    else {
        Logger.warn(INSTR_TRACE_TAG, `[PIN_CONFLICT] total=${conflictCount} — same pin on multiple nets`);
    }
}
/** 导线端点同坐标但 netId 不同 — 应合并而未合并 */
export function traceWireEndpointCollisions(wires: Wire[], doc: SchematicDocument): void {
    const netAtPoint = new Map<string, Set<string>>();
    const wireAtPoint = new Map<string, string[]>();
    for (let wi = 0; wi < wires.length; wi++) {
        const w = wires[wi];
        if (w.points.length < 2) {
            continue;
        }
        const endpoints = [w.points[0], w.points[w.points.length - 1]];
        for (let ei = 0; ei < endpoints.length; ei++) {
            const p = endpoints[ei];
            const key = `${Math.round(p.x)},${Math.round(p.y)}`;
            const nets = netAtPoint.get(key) ?? new Set<string>();
            nets.add(w.netId);
            netAtPoint.set(key, nets);
            const wlist = wireAtPoint.get(key) ?? [];
            wlist.push(`${w.id}@${ei === 0 ? 'start' : 'end'}`);
            wireAtPoint.set(key, wlist);
        }
    }
    let collisionCount = 0;
    netAtPoint.forEach((nets: Set<string>, key: string) => {
        if (nets.size <= 1) {
            return;
        }
        collisionCount++;
        const parts = key.split(',');
        const netNames: string[] = [];
        nets.forEach((id: string) => {
            const net = doc.nets.find(n => n.id === id);
            netNames.push(net !== undefined ? netDisplayName(net) : id.substring(0, 12));
        });
        const wiresHere = wireAtPoint.get(key) ?? [];
        Logger.warn(INSTR_TRACE_TAG, `[WIRE_COLLISION] point=(${parts[0]},${parts[1]}) nets=[${netNames.join('|')}] wires=[${wiresHere.join(', ')}] — should merge nets`);
    });
    if (collisionCount === 0) {
        Logger.info(INSTR_TRACE_TAG, '[WIRE_COLLISION] (none detected)');
    }
    else {
        Logger.warn(INSTR_TRACE_TAG, `[WIRE_COLLISION] total=${collisionCount} junction(s) need net merge`);
    }
}
/** 每个器件的引脚→net 映射（简要） */
export function traceComponentPinNets(doc: SchematicDocument): void {
    tracePerPinConnectivity(doc);
}
interface CompPinEntry {
    pinId: string;
    pinName: string;
    netId: string;
}
/** Collect unique pins for one component from net.pinIds. */
function collectCompPins(doc: SchematicDocument, compId: string): CompPinEntry[] {
    const seen = new Set<string>();
    const result: CompPinEntry[] = [];
    for (let ni = 0; ni < doc.nets.length; ni++) {
        const net = doc.nets[ni];
        for (let pi = 0; pi < net.pinIds.length; pi++) {
            const parsed = parsePinRef(net.pinIds[pi]);
            if (parsed === null || parsed.compId !== compId) {
                continue;
            }
            const key = `${parsed.pinId}\0${parsed.pinName}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            result.push({ pinId: parsed.pinId, pinName: parsed.pinName, netId: net.id });
        }
    }
    return result;
}
function formatPeerPins(net: Net, components: ComponentInstance[], selfCompId: string, selfPinKey: string, maxPeers: number = 12): string {
    const peers: string[] = [];
    for (let pi = 0; pi < net.pinIds.length; pi++) {
        const parsed = parsePinRef(net.pinIds[pi]);
        if (parsed === null) {
            continue;
        }
        const label = parsed.pinName.length > 0 ? parsed.pinName : parsed.pinId;
        const selfLabel = selfPinKey;
        if (parsed.compId === selfCompId &&
            (label.toUpperCase() === selfLabel.toUpperCase() || parsed.pinId.toUpperCase() === selfLabel.toUpperCase())) {
            continue;
        }
        const ref = refDesForComp(components, parsed.compId);
        peers.push(`${ref}.${label}`);
    }
    if (peers.length === 0) {
        return '(none)';
    }
    if (peers.length > maxPeers) {
        return `${peers.slice(0, maxPeers).join(', ')}...+${peers.length - maxPeers}`;
    }
    return peers.join(', ');
}
function instrumentModelHint(libraryId: string): string {
    const kind = detectInstrumentKind(libraryId);
    if (kind === 'vm' || kind === 'dmm') {
        return ' model=10MΩ(V+→COM) ΔV=V(V+)-V(COM) +当V+电位高于COM';
    }
    if (kind === 'am') {
        return ' model=0V Ideal-AM(I+→I-) I=MNA支路电流 +当电流从I+流向I-';
    }
    return '';
}
/**
 * 逐器件逐引脚连通详情：每个引脚所在 net/节点，以及同 net 上连接的其他引脚。
 * spiceMap 可选，用于标注 SPICE 节点名。
 */
export function tracePerPinConnectivity(doc: SchematicDocument, spiceMap?: Map<string, string>): void {
    Logger.info(INSTR_TRACE_TAG, `[PINCONN] ========== per-pin connectivity (${doc.components.length} components) ==========`);
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        const pins = collectCompPins(doc, comp.id);
        const modelHint = instrumentModelHint(comp.libraryId);
        Logger.info(INSTR_TRACE_TAG, `[PINCONN] ${comp.refDes} id=${comp.id} lib=${comp.libraryId}${modelHint}`);
        if (pins.length === 0) {
            Logger.warn(INSTR_TRACE_TAG, `[PINCONN]   (no pins on any net — check wiring)`);
            continue;
        }
        for (let pi = 0; pi < pins.length; pi++) {
            const pin = pins[pi];
            const pinLabel = pin.pinName.length > 0 ? pin.pinName : pin.pinId;
            const net = doc.nets.find(n => n.id === pin.netId);
            if (net === undefined) {
                Logger.warn(INSTR_TRACE_TAG, `[PINCONN]   ${pinLabel} → net=${pin.netId} (missing net record)`);
                continue;
            }
            const netName = netDisplayName(net);
            const spiceNode = spiceMap !== undefined ? (spiceMap.get(net.id) ?? '(unmapped)') : '';
            const nodePart = spiceNode.length > 0 ? ` node=${spiceNode}` : '';
            const peers = formatPeerPins(net, doc.components, comp.id, pinLabel);
            Logger.info(INSTR_TRACE_TAG, `[PINCONN]   ${pinLabel} → net=${netName} uuid=${net.id}${nodePart} peers=[${peers}]`);
        }
    }
    Logger.info(INSTR_TRACE_TAG, '[PINCONN] ========== per-pin connectivity END ==========');
}
/** 仪器测量端子与 MNA 模型极性（仿真时输出） */
export function traceInstrumentMeasureModel(doc: SchematicDocument, voltageFn: (netId: string) => number, currentFn: (compId: string) => number): void {
    Logger.info(INSTR_TRACE_TAG, '[INSTR_MODEL] voltmeter/ammeter MNA stamp & signed reading');
    for (let ci = 0; ci < doc.components.length; ci++) {
        const comp = doc.components[ci];
        const kind = detectInstrumentKind(comp.libraryId);
        const pinNets = getPinNetMap(comp.id, doc.nets);
        const netLabel = (netId: string): string => {
            const net = doc.nets.find(n => n.id === netId);
            return net !== undefined ? netDisplayName(net) : netId.substring(0, 14);
        };
        const findNet = (labels: string[]): string | null => {
            for (let li = 0; li < labels.length; li++) {
                const n = pinNets.get(labels[li].toUpperCase());
                if (n !== undefined) {
                    return n;
                }
            }
            return null;
        };
        if (kind === 'vm' || kind === 'dmm') {
            const vPlus = findNet(['V+', 'V', 'PLUS', '+']);
            const vCom = findNet(['COM', 'V-', '-', 'GND']);
            if (vPlus === null || vCom === null) {
                continue;
            }
            const vP = voltageFn(vPlus);
            const vC = voltageFn(vCom);
            const delta = vP - vC;
            Logger.info(INSTR_TRACE_TAG, `[INSTR_MODEL] ${comp.refDes} VM 10MΩ V+(${netLabel(vPlus)})=${vP.toFixed(4)}V ` +
                `COM(${netLabel(vCom)})=${vC.toFixed(4)}V Δ=${delta.toFixed(4)}V ` +
                `sign=${delta >= 0 ? '+' : '-'} (${delta >= 0 ? 'V+>COM' : 'COM>V+'})`);
        }
        else if (kind === 'am') {
            const iPlus = findNet(['I+', 'PLUS', '+']);
            const iMinus = findNet(['I-', 'MINUS', '-']);
            if (iPlus === null || iMinus === null) {
                continue;
            }
            const iBranch = currentFn(comp.id);
            const mA = iBranch * 1000;
            const iMinusLabel = iMinus !== null ? netLabel(iMinus) : '?';
            Logger.info(INSTR_TRACE_TAG, `[INSTR_MODEL] ${comp.refDes} AM Ideal I+(${netLabel(iPlus)})→I-(${iMinusLabel}) ` +
                `I=${mA.toFixed(4)}mA sign=${iBranch >= 0 ? '+' : '-'} ` +
                `(${iBranch >= 0 ? 'I+→I-' : 'I-→I+'})`);
        }
    }
}
/** 电阻分压拓扑检查：R1/R2 是否形成三节点分压 */
export function traceResistorDividerCheck(doc: SchematicDocument): void {
    const resistors = doc.components.filter(c => c.libraryId.toUpperCase().startsWith('R_') || c.libraryId.toUpperCase().includes('RESISTOR'));
    if (resistors.length < 2) {
        return;
    }
    for (let i = 0; i < resistors.length; i++) {
        const r1 = resistors[i];
        const r1Pins = getPinNetMap(r1.id, doc.nets);
        const r1Nets = new Set<string>();
        r1Pins.forEach((netId: string) => r1Nets.add(netId));
        if (r1Nets.size < 2) {
            Logger.warn(INSTR_TRACE_TAG, `[DIVIDER] ${r1.refDes} only ${r1Nets.size} net(s) — not a two-terminal connection`);
            continue;
        }
        for (let j = i + 1; j < resistors.length; j++) {
            const r2 = resistors[j];
            const r2Pins = getPinNetMap(r2.id, doc.nets);
            const r2Nets = new Set<string>();
            r2Pins.forEach((netId: string) => r2Nets.add(netId));
            const shared: string[] = [];
            r1Nets.forEach((n: string) => {
                if (r2Nets.has(n)) {
                    shared.push(n);
                }
            });
            if (shared.length === 0) {
                continue;
            }
            const allNets = new Set<string>();
            r1Nets.forEach((n: string) => allNets.add(n));
            r2Nets.forEach((n: string) => allNets.add(n));
            const netLabel = (id: string): string => {
                const net = doc.nets.find(n => n.id === id);
                return net !== undefined ? netDisplayName(net) : id.substring(0, 12);
            };
            if (allNets.size < 3) {
                const netList: string[] = [];
                allNets.forEach((n: string) => netList.push(netLabel(n)));
                Logger.warn(INSTR_TRACE_TAG, `[DIVIDER] ${r1.refDes}+${r2.refDes} share net(s) [${shared.map(netLabel).join(', ')}] ` +
                    `but only ${allNets.size} unique net(s) [${netList.join(', ')}] — ` +
                    `need 3 nets (VCC, MID, GND) for voltage divider`);
            }
            else if (shared.length === 1) {
                Logger.info(INSTR_TRACE_TAG, `[DIVIDER] ${r1.refDes}+${r2.refDes} OK: 3 nets, mid=${netLabel(shared[0])}`);
            }
            else if (shared.length >= 2) {
                Logger.warn(INSTR_TRACE_TAG, `[DIVIDER] ${r1.refDes}+${r2.refDes} share ${shared.length} nets — may be shorted`);
            }
        }
    }
}
/** 拓扑健康检查汇总 */
export function traceTopologyHealthCheck(doc: SchematicDocument, spiceMap?: Map<string, string>): void {
    Logger.info(INSTR_TRACE_TAG, '---------- TOPOLOGY HEALTH CHECK ----------');
    tracePinMultiNetConflicts(doc);
    traceWireEndpointCollisions(doc.wires, doc);
    tracePerPinConnectivity(doc, spiceMap);
    traceResistorDividerCheck(doc);
    traceInstrumentWiringIssues(doc);
    Logger.info(INSTR_TRACE_TAG, '---------- TOPOLOGY HEALTH CHECK END ----------');
}
/** HEX 烧录 / 固件加载 / MCU 执行 — 过滤 tag: instr_trace，前缀 [BURN] */
export function traceBurn(stage: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[BURN] ${stage} | ${detail}`);
}
/** UART 终端 ↔ MCU USART 路径 — 过滤 instr_trace，前缀 [UART] */
export function formatUartBytesHex(bytes: number[], maxBytes: number = 24): string {
    const n = Math.min(bytes.length, maxBytes);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
        parts.push((bytes[i] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
    }
    const overflow = bytes.length > maxBytes ? `...(+${bytes.length - maxBytes})` : '';
    return parts.join(' ') + overflow;
}
export function traceUart(stage: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[UART] ${stage} | ${detail}`);
}
/** 空闲 TX 0x55 刷屏节流：非 0x55 始终打；全是 0x55 时每 N 包打一次 */
let uartTxTraceBurst = 0;
let uartTxTraceSkipped = 0;
export function traceUartTxDrain(source: string, bytes: number[]): void {
    if (bytes.length === 0) {
        return;
    }
    let all55 = true;
    for (let i = 0; i < bytes.length; i++) {
        if ((bytes[i] & 0xFF) !== 0x55) {
            all55 = false;
            break;
        }
    }
    if (all55) {
        uartTxTraceBurst++;
        uartTxTraceSkipped += bytes.length;
        if ((uartTxTraceBurst % 32) !== 1) {
            return;
        }
        traceUart('MCU_TX_DRAIN', `src=${source} n=${bytes.length} all55 burst#${uartTxTraceBurst} skippedBytes=${uartTxTraceSkipped} ` +
            `hex=${formatUartBytesHex(bytes)}`);
        uartTxTraceSkipped = 0;
        return;
    }
    uartTxTraceBurst = 0;
    uartTxTraceSkipped = 0;
    traceUart('MCU_TX_DRAIN', `src=${source} n=${bytes.length} hex=${formatUartBytesHex(bytes)}`);
}
export function formatHexInfoSummary(info: HexFileInfo): string {
    const segs = info.flashSegments;
    const segParts: string[] = [];
    const limit = Math.min(segs.length, 8);
    for (let i = 0; i < limit; i++) {
        const s = segs[i];
        segParts.push(`0x${s.startAddr.toString(16)}+${s.length}`);
    }
    if (segs.length > limit) {
        segParts.push(`...+${segs.length - limit}`);
    }
    return `valid=${info.isValid} checksumOk=${info.checksumOk} bytes=${info.totalByteSize} ` +
        `range=0x${info.minAddr.toString(16)}-0x${info.maxAddr.toString(16)} ` +
        `segs=${segs.length}[${segParts.join(',')}] err=${info.errCode}`;
}
export function traceBurnHexInfo(stage: string, info: HexFileInfo): void {
    Logger.info(INSTR_TRACE_TAG, `[BURN] ${stage} | ${formatHexInfoSummary(info)}`);
}
/** 固件二进制前若干字节（十六进制），便于核对读到的文件 */
export function formatFirmwarePreview(data: Uint8Array, maxBytes: number = 16): string {
    const n = Math.min(data.length, maxBytes);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
        const b = data[i] & 0xFF;
        parts.push(b.toString(16).padStart(2, '0'));
    }
    if (data.length > n) {
        parts.push(`...(+${data.length - n})`);
    }
    return parts.join(' ');
}
/** ERC / 运行时错误列表 — 摘要 + 少量明细，避免主线程刷屏触发 THREAD_BLOCK */
export function traceErcErrorList(errors: ErcError[], context: string = 'ERC', maxDetail: number = 8): void {
    if (errors.length === 0) {
        Logger.info(INSTR_TRACE_TAG, `[${context}] errors=0`);
        return;
    }
    let errCount = 0;
    let warnCount = 0;
    for (let i = 0; i < errors.length; i++) {
        if (errors[i].severity === 'error' || errors[i].severity === 'critical') {
            errCount++;
        }
        else if (errors[i].severity === 'warning') {
            warnCount++;
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[${context}] errors=${errors.length} critical=${errCount} warn=${warnCount}`);
    // Prefer critical/error, then warning; skip info flood on main thread
    let shown = 0;
    for (let pass = 0; pass < 2 && shown < maxDetail; pass++) {
        for (let i = 0; i < errors.length && shown < maxDetail; i++) {
            const e = errors[i];
            const isHard = e.severity === 'error' || e.severity === 'critical';
            if (pass === 0 && !isHard) {
                continue;
            }
            if (pass === 1 && (isHard || e.severity === 'info')) {
                continue;
            }
            const target = e.targetUuid.length > 0 ? e.targetUuid : '-';
            const line = `[${context}] #${i + 1} ${e.severity} type=${e.errType} target=${target} ${e.desc}`;
            if (isHard) {
                Logger.warn(INSTR_TRACE_TAG, line);
            }
            else {
                Logger.info(INSTR_TRACE_TAG, line);
            }
            shown++;
        }
    }
    if (errors.length > shown) {
        Logger.info(INSTR_TRACE_TAG, `[${context}] ...+${errors.length - shown} more (UI list has full set)`);
    }
}
/** MNA 器件 stamp（电阻/仪器等） */
export function traceAnalogDeviceStamp(refDes: string, devId: string, libraryId: string, nodeA: string, nodeB: string, detail: string): void {
    const shorted = nodeA === nodeB ? ' SHORTED' : '';
    Logger.info(INSTR_TRACE_TAG, `[MNA] ${refDes} ${devId} lib=${libraryId} ${nodeA}->${nodeB}${shorted} ${detail}`);
}
export interface AnalogResistorStamp {
    devId: string;
    refDes: string;
    nodeA: string;
    nodeB: string;
    ohms: number;
}
/** 仿真网表电阻/电源汇总 */
export function traceAnalogNetlistSummary(resistors: AnalogResistorStamp[], vsrcLines: string[]): void {
    Logger.info(INSTR_TRACE_TAG, `[NETLIST] resistors=${resistors.length} vsrc=${vsrcLines.length}`);
    for (let i = 0; i < resistors.length; i++) {
        const r = resistors[i];
        Logger.info(INSTR_TRACE_TAG, `[NETLIST] ${r.devId} ${r.refDes} ${r.nodeA}->${r.nodeB} ${r.ohms}Ω`);
    }
    for (let i = 0; i < vsrcLines.length; i++) {
        Logger.info(INSTR_TRACE_TAG, `[NETLIST] ${vsrcLines[i]}`);
    }
}
/** 每个 net UUID 的电压解析路径 */
export function traceNetVoltageResolve(doc: SchematicDocument, voltageFn: (netId: string) => number, spiceMap: Map<string, string>): void {
    Logger.info(INSTR_TRACE_TAG, '[VRESOLVE] net UUID → spice node → voltage');
    for (let i = 0; i < doc.nets.length; i++) {
        const net = doc.nets[i];
        if (net.pinIds.length === 0) {
            continue;
        }
        const spiceNode = spiceMap.get(net.id) ?? '(unmapped)';
        const v = voltageFn(net.id);
        Logger.info(INSTR_TRACE_TAG, `[VRESOLVE] ${netDisplayName(net)} uuid=${net.id.substring(0, 16)} spice=${spiceNode} V=${v.toFixed(4)}V`);
    }
}
/** 每个连接点的仿真电压/电流快照 */
export function traceConnectionPointSimData(doc: SchematicDocument, voltageFn: (netId: string) => number, currentFn: (netId: string) => number, simActive: boolean, simState: string, maxNets: number = 30): void {
    Logger.info(INSTR_TRACE_TAG, `[SIMDATA] state=${simState} active=${simActive ? 'YES' : 'NO'}`);
    if (!simActive) {
        Logger.warn(INSTR_TRACE_TAG, '[SIMDATA] 仿真未运行 — 连接点电压/电流均为 0 或未初始化');
    }
    let shown = 0;
    for (let i = 0; i < doc.nets.length && shown < maxNets; i++) {
        const net = doc.nets[i];
        if (net.pinIds.length === 0) {
            continue;
        }
        const v = voltageFn(net.id);
        const netCurrent = currentFn(net.id);
        const pinLabels: string[] = [];
        const pinLimit = Math.min(net.pinIds.length, 6);
        for (let pi = 0; pi < pinLimit; pi++) {
            const parsed = parsePinRef(net.pinIds[pi]);
            if (parsed !== null) {
                const ref = refDesForComp(doc.components, parsed.compId);
                pinLabels.push(`${ref}.${parsed.pinName.length > 0 ? parsed.pinName : parsed.pinId}`);
            }
        }
        Logger.info(INSTR_TRACE_TAG, `[SIMDATA] net=${netDisplayName(net)} V=${v.toFixed(4)}V I=${(netCurrent * 1000).toFixed(4)}mA ` +
            `pins=[${pinLabels.join(', ')}]`);
        shown++;
    }
}
/** SPICE 节点映射 */
export function traceSpiceNodeMap(spiceMap: Map<string, string>, maxEntries: number = 15): void {
    if (spiceMap.size === 0) {
        Logger.info(INSTR_TRACE_TAG, '[SPICE] nodeMap=(empty)');
        return;
    }
    const parts: string[] = [];
    let count = 0;
    spiceMap.forEach((nodeName: string, netUuid: string) => {
        if (count >= maxEntries) {
            return;
        }
        parts.push(`${netUuid.substring(0, 12)}→${nodeName}`);
        count++;
    });
    const overflow = spiceMap.size > maxEntries ? ` ...+${spiceMap.size - maxEntries}` : '';
    Logger.info(INSTR_TRACE_TAG, `[SPICE] nodeMap={${parts.join(', ')}${overflow}}`);
}
/** 节点电压 + 支路电流全局快照 */
export function traceSimGlobalSnapshot(voltages: Map<string, number>, branchCurrents: Map<string, number>, waves: WaveData[], stepCount: number): void {
    Logger.info(INSTR_TRACE_TAG, `[SNAPSHOT] step=${stepCount} V={${formatVoltageSample(voltages, 12)}} ` +
        `I={${formatCurrentSample(branchCurrents, 8)}} waves=[${formatWaveSummary(waves, 6)}]`);
}
/** 工程打开后的全面系统审计 */
export function traceProjectOpenAudit(path: string, projectName: string, doc: SchematicDocument, viewport: ViewportState): void {
    Logger.info(INSTR_TRACE_TAG, '========== PROJECT OPEN AUDIT START ==========');
    traceDataFlow('OPEN', `path=${path} project=${projectName} doc=${doc.id} v=${doc.version}`);
    traceCanvasInfo(doc, viewport);
    traceComponentLayout(doc.components);
    traceWireTopology(doc.wires);
    traceNetPinDetail(doc);
    traceUnconnectedComponents(doc);
    traceInstrumentInventory(doc);
    traceTopologyHealthCheck(doc);
    traceDataFlow('OPEN', `audit complete comps=${doc.components.length} nets=${doc.nets.length} wires=${doc.wires.length}`);
    Logger.info(INSTR_TRACE_TAG, '========== PROJECT OPEN AUDIT END ==========');
}
/** 仿真启动后的数据流审计 */
export function traceSimStartupAudit(doc: SchematicDocument, simState: SimulationState, stepCount: number, voltageFn: (netId: string) => number, currentFn: (netId: string) => number, voltages: Map<string, number>, branchCurrents: Map<string, number>, waves: WaveData[], spiceMap: Map<string, string>, activeComp: string | null, branchCurrentForComp?: (compId: string) => number): void {
    Logger.info(INSTR_TRACE_TAG, '========== SIM STARTUP AUDIT START ==========');
    traceDataFlow('SIM_START', `state=${simState} step=${stepCount} active=${activeComp ?? 'null'}`);
    traceTopologyHealthCheck(doc, spiceMap);
    const compCurrentFn = branchCurrentForComp ?? ((_compId: string) => 0);
    traceInstrumentMeasureModel(doc, voltageFn, compCurrentFn);
    // Logic analyzer channel levels (lab_digital)
    for (let ci = 0; ci < doc.components.length; ci++) {
        const c = doc.components[ci];
        if (!c.libraryId.toUpperCase().includes('LOGIC_ANALYZER')) {
            continue;
        }
        const pinNets = getPinNetMap(c.id, doc.nets);
        const chParts: string[] = [];
        for (let ch = 1; ch <= 8; ch++) {
            const netId = pinNets.get(`CH${ch}`);
            if (netId === undefined || netId.length === 0) {
                continue;
            }
            const v = voltageFn(netId);
            const bit = v >= 2.0 ? 'H' : (v <= 0.8 ? 'L' : '?');
            chParts.push(`CH${ch}=${bit}(${v.toFixed(2)}V)`);
        }
        traceLogicAnalyzerChannels(`${c.refDes}@audit`, chParts);
    }
    traceConnectionPointSimData(doc, voltageFn, currentFn, true, simState);
    traceNetVoltageResolve(doc, voltageFn, spiceMap);
    traceSpiceNodeMap(spiceMap);
    traceSimGlobalSnapshot(voltages, branchCurrents, waves, stepCount);
    traceInstrumentInventory(doc);
    Logger.info(INSTR_TRACE_TAG, '========== SIM STARTUP AUDIT END ==========');
}
export function traceBindingRefresh(compId: string, refDes: string, pinMap: Map<string, string>, binding: BindingTraceInfo, simActive: boolean = false, netVoltageDetail: string = ''): void {
    const simTag = simActive ? 'RUNNING' : 'IDLE';
    let msg = `bind comp=${compId} ref=${refDes} sim=${simTag} pins={${formatPinNetMap(pinMap)}} ${formatBindingSummary(binding)}`;
    if (netVoltageDetail.length > 0) {
        msg += ` ${netVoltageDetail}`;
    }
    Logger.info(INSTR_TRACE_TAG, msg);
    if (!simActive) {
        Logger.warn(INSTR_TRACE_TAG, `bind ${refDes}: 仿真未运行，仪器读数不可用 — 请先点击「运行仿真」`);
    }
}
/** 电压/电流测量结果（节流输出） */
let lastMeasureKey = '';
let lastMeasureTick = 0;
export function traceMeasure(refDes: string, kind: string, simActive: boolean, detail: string): void {
    const key = `${refDes}:${kind}:${detail}`;
    const now = Date.now();
    if (key === lastMeasureKey && now - lastMeasureTick < 2000) {
        return;
    }
    lastMeasureKey = key;
    lastMeasureTick = now;
    Logger.info(INSTR_TRACE_TAG, `measure ref=${refDes} kind=${kind} sim=${simActive ? 'RUNNING' : 'IDLE'} ${detail}`);
}
export function traceActiveComponent(compId: string | null, source: string): void {
    Logger.debug(INSTR_TRACE_TAG, `active comp=${compId ?? 'null'} src=${source}`);
}
/** 仅当 active 器件变化时输出 INFO */
let lastActiveCompLogged: string | null = null;
export function traceActiveComponentChanged(compId: string | null, source: string): void {
    const normalized = compId ?? '';
    if (normalized === (lastActiveCompLogged ?? '')) {
        return;
    }
    lastActiveCompLogged = compId;
    Logger.info(INSTR_TRACE_TAG, `active CHANGED comp=${compId ?? 'null'} src=${source}`);
}
export function traceReloadSchematic(activeComp: string | null, compCount: number, netCount: number): void {
    Logger.info(INSTR_TRACE_TAG, `reload schematic comps=${compCount} nets=${netCount} active=${activeComp ?? 'null'}`);
}
export function traceSimStep(stepCount: number, waveCount: number, waves: WaveData[], activeComp: string | null, voltages: Map<string, number>, branchCurrents?: Map<string, number>): void {
    if (!INSTR_TRACE_SIM_STEP && stepCount % 100 !== 0) {
        return;
    }
    let msg = `sim step=${stepCount} waves=${waveCount} active=${activeComp ?? 'null'} ` +
        `w=[${formatWaveSummary(waves, 4)}] V={${formatVoltageSample(voltages, 6)}}`;
    if (branchCurrents !== undefined) {
        msg += ` I={${formatCurrentSample(branchCurrents, 4)}}`;
    }
    if (stepCount % 100 === 0) {
        Logger.info(INSTR_TRACE_TAG, msg);
    }
    else {
        Logger.debug(INSTR_TRACE_TAG, msg);
    }
}
export function traceCaptureWave(channel: number, probe: string, source: string, pointCount: number, lastV: number, vpp: number = 0, rawSpanSec: number = 0, estFreq: number = 0): void {
    const spanMs = rawSpanSec * 1e3;
    const msg = `scope CH${channel + 1} probe=${probe.length > 18 ? probe.substring(0, 18) : probe} ` +
        `src=${source} pts=${pointCount} last=${lastV.toFixed(4)}V ` +
        `Vpp=${vpp.toFixed(4)}V span=${spanMs.toFixed(3)}ms f=${estFreq > 0 ? estFreq.toFixed(1) : '--'}Hz`;
    // 短窗/低 Vpp 用 info，便于现场确认是否仍在「仿真时间几乎不前进」
    if (vpp < 0.05 || rawSpanSec < 5e-4 || source === 'history' || source === 'flatDC') {
        Logger.info(INSTR_TRACE_TAG, msg);
    }
    else {
        Logger.debug(INSTR_TRACE_TAG, msg);
    }
}
export function traceUiRefresh(panel: string, compId: string, refDes: string, libraryId: string, instrKind: string, reading: string): void {
    Logger.debug(INSTR_TRACE_TAG, `${panel} comp=${compId} ref=${refDes} lib=${libraryId} kind=${instrKind} reading=${reading}`);
}
/**
 * InstrumentPanel 刷新诊断 — INFO 级，写入右侧「日志」面板便于排查 500ms 轮询。
 * stage 例：TIMER_START / TIMER_FIRE / TIMER_STOP / REFRESH / SKIP / ERROR
 */
export function traceInstrUi(stage: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[INSTR_UI] ${stage} | ${detail}`);
}
/** 选中器件变化时输出 INFO 级日志（便于在默认 log level 下追踪） */
export function traceUiSelect(panel: string, compId: string, refDes: string, libraryId: string, instrKind: string, reading: string): void {
    Logger.info(INSTR_TRACE_TAG, `[SELECT] ${panel} comp=${compId} ref=${refDes} lib=${libraryId} kind=${instrKind} reading=${reading}`);
}
export function traceLoadSchematic(clearedWaves: boolean, compCount: number, netCount: number): void {
    Logger.info(INSTR_TRACE_TAG, `kernel loadSchematic comps=${compCount} nets=${netCount} clearedWaves=${clearedWaves}`);
}
export function traceAnalogOpSummary(resistorCount: number, vsrcCount: number, converged: boolean, nodeSample: string): void {
    Logger.info(INSTR_TRACE_TAG, `analog OP R=${resistorCount} Vsrc=${vsrcCount} converged=${converged} nodes={${nodeSample}}`);
}
export function traceNetConnectivity(pinsBefore: number, pinsAfter: number, wiresMatched: number, compCount: number, wireCount: number): void {
    Logger.info(INSTR_TRACE_TAG, `net_pins before=${pinsBefore} after=${pinsAfter} wire_hits=${wiresMatched} comps=${compCount} wires=${wireCount}`);
}
export function tracePinNetEmpty(compId: string, refDes: string): void {
    Logger.warn(INSTR_TRACE_TAG, `bind FAILED: no pin nets for comp=${compId} ref=${refDes} — check wire connectivity / rebuildNetPinConnectivity`);
}
/** MCU 执行步进摘要 — [MCU] */
export function traceMcuTick(family: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[MCU] TICK | family=${family} ${detail}`);
}
/**
 * MCU GPIO → 模拟节点驱动。patternOn = bits where level==0 (sink / LED lit for 灌电流).
 * missPins = schematic pin labels that had no net binding.
 */
export function traceMcuGpioSync(family: string, refDes: string, portName: string, portVal: number, drives: string[], missPins: string[]): void {
    const lit: string[] = [];
    for (let b = 0; b < 8; b++) {
        if (((portVal >> b) & 1) === 0) {
            lit.push(`${portName}.${b}`);
        }
    }
    Logger.info(INSTR_TRACE_TAG, `[MCU] GPIO_SYNC | family=${family} mcu=${refDes} ${portName}=0x${(portVal & 0xFF).toString(16).padStart(2, '0').toUpperCase()} ` +
        `sinkLow=[${lit.join(',')}] drives=${drives.length} miss=[${missPins.join(',')}]`);
    const maxShow = Math.min(drives.length, 8);
    for (let i = 0; i < maxShow; i++) {
        Logger.info(INSTR_TRACE_TAG, `[MCU]   drive ${drives[i]}`);
    }
    if (drives.length > maxShow) {
        Logger.info(INSTR_TRACE_TAG, `[MCU]   ...+${drives.length - maxShow} more drives`);
    }
    // Only warn when nothing is driven: unbound PA1.. are normal for min-system templates.
    if (missPins.length > 0 && drives.length === 0) {
        Logger.warn(INSTR_TRACE_TAG, `[MCU] GPIO_MISS | ${refDes} unbound pins=[${missPins.join(',')}] — LED/GPIO will not animate`);
    }
}
/** LED forward voltage sample for instr_trace (why canvas glow is on/off). */
export function traceLedVfSample(lines: string[]): void {
    if (lines.length === 0) {
        return;
    }
    Logger.info(INSTR_TRACE_TAG, `[LED] VF sample count=${lines.length}`);
    const maxShow = Math.min(lines.length, 10);
    for (let i = 0; i < maxShow; i++) {
        Logger.info(INSTR_TRACE_TAG, `[LED]   ${lines[i]}`);
    }
}
/** Pushbutton pressed/open state + KEY net voltage for switch↔MCU↔relay debugging. */
export function traceSwitchSample(lines: string[]): void {
    if (lines.length === 0) {
        return;
    }
    Logger.info(INSTR_TRACE_TAG, `[SW] sample count=${lines.length}`);
    const maxShow = Math.min(lines.length, 8);
    for (let i = 0; i < maxShow; i++) {
        Logger.info(INSTR_TRACE_TAG, `[SW]   ${lines[i]}`);
    }
}
/** Relay coil + NO/NC contact ohms / energized flag (why DNO/DNC both lit). */
export function traceRelaySample(lines: string[]): void {
    if (lines.length === 0) {
        return;
    }
    Logger.info(INSTR_TRACE_TAG, `[REL] sample count=${lines.length}`);
    const maxShow = Math.min(lines.length, 8);
    for (let i = 0; i < maxShow; i++) {
        Logger.info(INSTR_TRACE_TAG, `[REL]   ${lines[i]}`);
    }
}
/** One pot/switch tick: per-instrument snapped reading for live-sync debugging. */
export interface InteractiveMeterSnap {
    refDes: string;
    kind: string;
    value: string;
}
let lastInstrLiveMs: number = 0;
let lastInstrLiveFingerprint: string = '';
/**
 * Interactive pot/switch: log ALL meter snaps + key node voltages.
 * Throttled (~10Hz) unless fingerprint changes (new wiper / MID / readings).
 * Filter: instr_trace → [INSTR_LIVE]
 */
export function traceInteractiveInstrumentLive(reason: string, detail: string, namedVolts: Map<string, number>, meters: InteractiveMeterSnap[], activeRefOrId: string, force: boolean = false): void {
    const prefer = ['VCC', 'HI', 'NET_2', 'MID', 'ADC', '1WIRE', 'HALL', 'GND'];
    const netParts: string[] = [];
    for (let i = 0; i < prefer.length; i++) {
        const n = prefer[i];
        const v = namedVolts.get(n);
        if (v !== undefined) {
            netParts.push(`${n}=${v.toFixed(3)}V`);
        }
    }
    const meterParts: string[] = [];
    for (let i = 0; i < meters.length; i++) {
        const m = meters[i];
        meterParts.push(`${m.refDes}/${m.kind}=${m.value}`);
    }
    const fingerprint = `${reason}|${detail}|${netParts.join(',')}|${meterParts.join(';')}`;
    const now = Date.now();
    if (!force) {
        if (fingerprint === lastInstrLiveFingerprint && now - lastInstrLiveMs < 150) {
            return;
        }
        if (now - lastInstrLiveMs < 80) {
            return;
        }
    }
    lastInstrLiveMs = now;
    lastInstrLiveFingerprint = fingerprint;
    Logger.info(INSTR_TRACE_TAG, `[INSTR_LIVE] ${reason} ${detail} nets={${netParts.join(', ')}} ` +
        `meters=[${meterParts.join('; ')}] active=${activeRefOrId.length > 0 ? activeRefOrId : 'null'}`);
}
/** 将换行压成可见标记，便于 instr_trace 单行分片展示 */
function flattenAiTraceText(text: string): string {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        if (ch === '\n' || ch === '\r') {
            out += '⏎';
        }
        else if (ch === '\t') {
            out += ' ';
        }
        else {
            out += ch;
        }
    }
    return out;
}
/**
 * AI 指令/回复正文写入 instr_trace（自动截断分片）。
 * prefix 例：AI_API / AI_PIPE / AI_GEN；kind 例：PROMPT / REPLY / USER
 */
export function traceAiPayload(prefix: string, kind: string, text: string, meta: string = ''): void {
    const raw = text ?? '';
    const flat = flattenAiTraceText(raw);
    const maxTotal = 2400;
    const chunkSize = 360;
    const truncated = flat.length > maxTotal;
    const body = truncated ? flat.substring(0, maxTotal) : flat;
    const metaPart = meta.length > 0 ? ` ${meta}` : '';
    Logger.info(INSTR_TRACE_TAG, `[${prefix}] ${kind} len=${raw.length}` +
        `${truncated ? ` show=${body.length}` : ''}${metaPart}`);
    if (body.length === 0) {
        Logger.info(INSTR_TRACE_TAG, `[${prefix}] ${kind} | (empty)`);
        return;
    }
    let offset = 0;
    let part = 0;
    while (offset < body.length) {
        const end = Math.min(offset + chunkSize, body.length);
        Logger.info(INSTR_TRACE_TAG, `[${prefix}] ${kind}|${part} ${body.substring(offset, end)}`);
        offset = end;
        part++;
    }
    if (truncated) {
        Logger.info(INSTR_TRACE_TAG, `[${prefix}] ${kind} <<< truncated`);
    }
}
/** AI 管线/UI 操作步骤（选型/摆放/建网/落图等） */
export function traceAiOp(prefix: string, op: string, detail: string): void {
    Logger.info(INSTR_TRACE_TAG, `[${prefix}] OP ${op} | ${detail}`);
}
/**
 * AI 生图阶段标准化日志（排错主线）。
 * 过滤 instr_trace 后按 STAGE_BEGIN → METRIC → STAGE_END / STAGE_ABORT 复盘。
 * phase: BEGIN | END | METRIC | ABORT | RETRY
 */
export function traceAiStage(prefix: string, stage: string, phase: string, detail: string = ''): void {
    const d = (detail ?? '').trim();
    Logger.info(INSTR_TRACE_TAG, `[${prefix}] STAGE_${phase} ${stage}` + (d.length > 0 ? ` | ${d}` : ''));
}
/**
 * AI 诊断多行明细（布局 AABB/间距、建网失败、ERC 条目等）。
 * stage 例：layout_aabb / layout_gap / place_match / net_fail / erc_block
 */
export function traceAiDiag(prefix: string, stage: string, lines: string[], maxLines: number = 48): void {
    const n = lines.length;
    const show = Math.min(n, Math.max(1, maxLines));
    Logger.info(INSTR_TRACE_TAG, `[${prefix}] DIAG ${stage} | count=${n}` +
        `${n > show ? ` show=${show}` : ''}`);
    if (n === 0) {
        Logger.info(INSTR_TRACE_TAG, `[${prefix}] DIAG ${stage} | (none)`);
        return;
    }
    for (let i = 0; i < show; i++) {
        Logger.info(INSTR_TRACE_TAG, `[${prefix}] DIAG|${stage}|${i} ${lines[i]}`);
    }
    if (n > show) {
        Logger.info(INSTR_TRACE_TAG, `[${prefix}] DIAG ${stage} <<< truncated +${n - show}`);
    }
}
