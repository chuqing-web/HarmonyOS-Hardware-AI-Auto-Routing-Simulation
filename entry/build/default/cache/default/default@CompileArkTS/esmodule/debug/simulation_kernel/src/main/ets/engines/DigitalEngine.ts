import { LogicState, MinHeap, getPinNetMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchematicDocument } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
// ---- 74HC 系列典型时序参数 (Vcc=5V, 25°C) ----
interface HcTimingEntry {
    tPLH: number;
    tPHL: number;
    cin: number;
}
/** 最长键优先，避免 '74' 误匹配 74HC00/04/… */
const HC_TIMING_KEYS: string[] = [
    '138', '245', '595', '00', '02', '04', '08', '32', '86', '74'
];
const HC_TIMING: Record<string, HcTimingEntry> = {
    '00': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '02': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '04': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '08': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '32': { tPLH: 7e-9, tPHL: 7e-9, cin: 3.5e-12 },
    '86': { tPLH: 10e-9, tPHL: 10e-9, cin: 3.5e-12 },
    '74': { tPLH: 14e-9, tPHL: 14e-9, cin: 3.5e-12 },
    '138': { tPLH: 11e-9, tPHL: 11e-9, cin: 3.5e-12 },
    '245': { tPLH: 8e-9, tPHL: 8e-9, cin: 5e-12 },
    '595': { tPLH: 14e-9, tPHL: 14e-9, cin: 3.5e-12 },
    'default': { tPLH: 9e-9, tPHL: 9e-9, cin: 3.5e-12 }
};
const FANOUT_LOAD_FACTOR = 50e-12; // 每个扇出负载 ~50pF (含走线电容)
const MIN_PULSE_WIDTH = 2e-9; // 最小脉冲宽度 2ns
const SETUP_TIME_DFF = 5e-9; // D-FF setup time
const HOLD_TIME_DFF = 1e-9; // D-FF hold time
const MAX_HAZARD_HISTORY = 100;
interface DigitalNode {
    id: string;
    state: LogicState;
    drivers: string[];
    propagationDelay: number;
    lastChangeTime: number;
    lastChangeState: LogicState;
}
interface DigitalEvent {
    time: number;
    nodeId: string;
    newState: LogicState;
}
interface LogicGate {
    compId: string;
    gateType: string;
    inputIds: string[];
    outputId: string;
    tPLH: number;
    tPHL: number;
    inputCap: number;
    triState: boolean;
    enableId: string;
}
interface Shift595State {
    shiftReg: number;
    latch: number;
    lastShcp: LogicState;
    lastStcp: LogicState;
    lastDsSetupTime: number;
    lastShcpEdgeTime: number;
    qNetIds: string[];
}
interface DffState {
    lastClk: LogicState;
    lastDSetupTime: number;
    lastClkEdgeTime: number;
}
interface Cd4017State {
    count: number;
    lastClk: LogicState;
    qNetIds: string[];
}
export interface HazardReport {
    path: string;
    type: 'glitch' | 'contention' | 'setup_violation' | 'hold_violation';
    sourceNodeId: string;
    affectedNodeId: string;
    toggleCount: number;
}
export class DigitalEngine {
    private nodes: Map<string, DigitalNode> = new Map();
    private gates: LogicGate[] = [];
    private eventHeap: MinHeap<DigitalEvent> = new MinHeap<DigitalEvent>((a: DigitalEvent, b: DigitalEvent) => a.time - b.time);
    private currentTime: number = 0;
    private hazardPaths: HazardReport[] = [];
    private shift595States: Map<string, Shift595State> = new Map();
    private dffStates: Map<string, DffState> = new Map();
    private cd4017States: Map<string, Cd4017State> = new Map();
    private toggleCounts: Map<string, number> = new Map();
    private doc: SchematicDocument | null = null;
    loadSchematic(doc: SchematicDocument): void {
        this.doc = doc;
        this.nodes.clear();
        this.gates = [];
        this.eventHeap.clear();
        this.hazardPaths = [];
        this.shift595States.clear();
        this.dffStates.clear();
        this.cd4017States.clear();
        this.toggleCounts.clear();
        for (const net of doc.nets) {
            this.nodes.set(net.id, {
                id: net.id,
                state: LogicState.UNKNOWN,
                drivers: [],
                propagationDelay: 10e-9,
                lastChangeTime: 0,
                lastChangeState: LogicState.UNKNOWN
            });
        }
        for (const comp of doc.components) {
            if (comp.libraryId.includes('74HC') || comp.libraryId.includes('74LS') ||
                comp.libraryId.includes('74HCT') || comp.libraryId.includes('CD40')) {
                this.initLogicGateFromNets(comp.id, comp.libraryId);
            }
        }
        this.buildFanoutWeights();
    }
    /** Resolve first matching pin alias (1A/A/1 …) → net UUID */
    private resolvePinNet(pinNet: Map<string, string>, aliases: string[]): string | undefined {
        for (let i = 0; i < aliases.length; i++) {
            const hit = pinNet.get(aliases[i].toUpperCase());
            if (hit !== undefined && hit.length > 0) {
                return hit;
            }
        }
        return undefined;
    }
    /** Initialize logic gates using real net connections instead of synthetic pin names */
    private initLogicGateFromNets(compId: string, libraryId: string): void {
        const pinNet = this.doc ? getPinNetMap(compId, this.doc.nets) : new Map<string, string>();
        const timing = this.resolveTiming(libraryId);
        const lib = libraryId.toUpperCase();
        if (lib.includes('CD4017') || lib.includes('4017')) {
            this.initCd4017(compId, pinNet, timing);
            return;
        }
        if (lib.includes('74HC04') || lib.includes('74LS04') || lib.includes('74HCT04') ||
            (lib.includes('04') && !lib.includes('4017') && !lib.includes('1404'))) {
            const inNet = this.resolvePinNet(pinNet, ['1A', 'A', '1', 'IN']);
            const outNet = this.resolvePinNet(pinNet, ['1Y', 'Y', '2', 'OUT']);
            if (inNet && outNet) {
                this.registerGate(compId, 'NOT', [inNet], outNet, timing.tPLH, timing.tPHL, timing.cin, false, '');
                this.ensureNode(inNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(outNet, LogicState.UNKNOWN, timing.tPLH);
            }
        }
        else if (lib.includes('08') || lib.includes('00') ||
            lib.includes('32') || lib.includes('02') ||
            lib.includes('86')) {
            let gateType = 'AND';
            if (lib.includes('00'))
                gateType = 'NAND';
            else if (lib.includes('02'))
                gateType = 'NOR';
            else if (lib.includes('32'))
                gateType = 'OR';
            else if (lib.includes('86'))
                gateType = 'XOR';
            const aNet = this.resolvePinNet(pinNet, ['1A', 'A', '1']);
            const bNet = this.resolvePinNet(pinNet, ['1B', 'B', '2']);
            const yNet = this.resolvePinNet(pinNet, ['1Y', 'Y', '3']);
            if (aNet && bNet && yNet) {
                this.registerGate(compId, gateType, [aNet, bNet], yNet, timing.tPLH, timing.tPHL, timing.cin, false, '');
                this.ensureNode(aNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(bNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(yNet, LogicState.UNKNOWN, timing.tPLH);
            }
        }
        else if (lib.includes('74HC74') || lib.includes('74LS74') ||
            (lib.includes('74') && !lib.includes('74595') && !lib.includes('595'))) {
            // Lab wires 74HC74 as dual A/B/Y (Builtin XOR demo); real D/CLK/Q → DFF
            const aNet = this.resolvePinNet(pinNet, ['1A', 'A', '1']);
            const bNet = this.resolvePinNet(pinNet, ['1B', 'B', '2']);
            const yNet = this.resolvePinNet(pinNet, ['1Y', 'Y', '3']);
            const dNet = this.resolvePinNet(pinNet, ['1D', 'D']);
            const clkNet = this.resolvePinNet(pinNet, ['1CLK', 'CLK', 'CP']);
            const qNet = this.resolvePinNet(pinNet, ['1Q', 'Q']);
            if (dNet && clkNet && qNet) {
                this.registerGate(compId, 'DFF', [dNet, clkNet], qNet, timing.tPLH, timing.tPHL, timing.cin, false, '');
                this.ensureNode(dNet, LogicState.LOW, timing.tPLH);
                this.ensureNode(clkNet, LogicState.LOW, timing.tPLH);
                this.ensureNode(qNet, LogicState.LOW, timing.tPLH);
                this.dffStates.set(compId, { lastClk: LogicState.LOW, lastDSetupTime: 0, lastClkEdgeTime: 0 });
            }
            else if (aNet && bNet && yNet) {
                // BuiltinComponents marks 74HC74 as XOR dual-gate for lab_digital
                this.registerGate(compId, 'XOR', [aNet, bNet], yNet, timing.tPLH, timing.tPHL, timing.cin, false, '');
                this.ensureNode(aNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(bNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(yNet, LogicState.UNKNOWN, timing.tPLH);
            }
        }
        else if (libraryId.includes('125')) {
            const inNet = pinNet.get('1A') ?? pinNet.get('A');
            const outNet = pinNet.get('1Y') ?? pinNet.get('Y');
            const oeNet = pinNet.get('1OE') ?? pinNet.get('OE');
            if (inNet && outNet) {
                this.registerGate(compId, 'BUF', [inNet], outNet, timing.tPLH, timing.tPHL, timing.cin, true, oeNet ?? '');
                this.ensureNode(inNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(outNet, LogicState.HIGH_Z, timing.tPLH);
                if (oeNet)
                    this.ensureNode(oeNet, LogicState.HIGH, timing.tPLH);
            }
        }
        else if (libraryId.includes('245')) {
            const aNet = pinNet.get('A0') ?? pinNet.get('A');
            const bNet = pinNet.get('B0') ?? pinNet.get('B');
            const dirNet = pinNet.get('DIR');
            const oeNet = pinNet.get('OE');
            if (aNet && bNet) {
                this.registerGate(compId, 'BUF', [aNet], bNet, timing.tPLH, timing.tPHL, timing.cin, true, oeNet ?? '');
                this.ensureNode(aNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(bNet, LogicState.UNKNOWN, timing.tPLH);
                if (oeNet)
                    this.ensureNode(oeNet, LogicState.HIGH, timing.tPLH);
            }
        }
        else if (libraryId.includes('595')) {
            const dsNet = pinNet.get('DS') ?? pinNet.get('SER');
            const shcpNet = pinNet.get('SHCP') ?? pinNet.get('SRCLK');
            const stcpNet = pinNet.get('STCP') ?? pinNet.get('RCLK');
            const qNetIds: string[] = [];
            for (let q = 0; q < 8; q++) {
                const qId = pinNet.get(`Q${q}`) ?? `${compId}_Q${q}`;
                qNetIds.push(qId);
                this.ensureNode(qId, LogicState.LOW, timing.tPLH);
            }
            if (dsNet && shcpNet && stcpNet) {
                this.shift595States.set(compId, {
                    shiftReg: 0, latch: 0, lastShcp: LogicState.LOW, lastStcp: LogicState.LOW,
                    lastDsSetupTime: 0, lastShcpEdgeTime: 0, qNetIds
                });
                this.registerGate(compId, 'SHIFT595', [dsNet, shcpNet, stcpNet], qNetIds[0], timing.tPLH, timing.tPHL, timing.cin, false, '');
                this.ensureNode(dsNet, LogicState.LOW, timing.tPLH);
                this.ensureNode(shcpNet, LogicState.LOW, timing.tPLH);
                this.ensureNode(stcpNet, LogicState.LOW, timing.tPLH);
            }
        }
        else if (libraryId.includes('138')) {
            const a0Net = pinNet.get('A0');
            const a1Net = pinNet.get('A1');
            const a2Net = pinNet.get('A2');
            const enNet = pinNet.get('E1') ?? pinNet.get('E');
            if (a0Net && a1Net && a2Net) {
                this.registerGate(compId, 'DEC138', [a0Net, a1Net, a2Net, enNet ?? ''], pinNet.get('Y0') ?? `${compId}_Y0`, timing.tPLH, timing.tPHL, timing.cin, false, '');
                this.ensureNode(a0Net, LogicState.LOW, timing.tPLH);
                this.ensureNode(a1Net, LogicState.LOW, timing.tPLH);
                this.ensureNode(a2Net, LogicState.LOW, timing.tPLH);
                if (enNet)
                    this.ensureNode(enNet, LogicState.LOW, timing.tPLH);
                for (let y = 0; y < 8; y++) {
                    const yId = pinNet.get(`Y${y}`) ?? `${compId}_Y${y}`;
                    this.ensureNode(yId, LogicState.HIGH, timing.tPLH);
                }
            }
        }
        else {
            const inNet = this.resolvePinNet(pinNet, ['1A', 'A', 'IN']);
            const outNet = this.resolvePinNet(pinNet, ['1Y', 'Y', 'OUT']);
            if (inNet && outNet) {
                this.registerGate(compId, 'BUF', [inNet], outNet, timing.tPLH, timing.tPHL, timing.cin, false, '');
                this.ensureNode(inNet, LogicState.UNKNOWN, timing.tPLH);
                this.ensureNode(outNet, LogicState.UNKNOWN, timing.tPLH);
            }
        }
    }
    /** CD4017: CLK=14, /CE=13, RST=15, Q0=3 (lab probes Q0) */
    private initCd4017(compId: string, pinNet: Map<string, string>, timing: HcTimingEntry): void {
        const clkNet = this.resolvePinNet(pinNet, ['14', 'CLK', 'CP']);
        const enNet = this.resolvePinNet(pinNet, ['13', 'CE', 'EN']);
        const rstNet = this.resolvePinNet(pinNet, ['15', 'RST', 'MR', 'RESET']);
        const q0Net = this.resolvePinNet(pinNet, ['3', 'Q0', 'Q']);
        if (!clkNet || !q0Net) {
            return;
        }
        const inputs: string[] = [clkNet];
        if (enNet) {
            inputs.push(enNet);
        }
        if (rstNet) {
            inputs.push(rstNet);
        }
        // Q0..Q9 DIP pin map: 3,2,4,7,10,1,5,6,9,11
        const qPins = ['3', '2', '4', '7', '10', '1', '5', '6', '9', '11'];
        const qNetIds: string[] = [];
        for (let q = 0; q < 10; q++) {
            const qId = this.resolvePinNet(pinNet, [qPins[q], `Q${q}`]) ?? (q === 0 ? q0Net : `${compId}_Q${q}`);
            qNetIds.push(qId);
            this.ensureNode(qId, q === 0 ? LogicState.HIGH : LogicState.LOW, timing.tPLH);
        }
        this.cd4017States.set(compId, { count: 0, lastClk: LogicState.LOW, qNetIds });
        this.registerGate(compId, 'CD4017', inputs, q0Net, timing.tPLH, timing.tPHL, timing.cin, false, '');
        this.ensureNode(clkNet, LogicState.LOW, timing.tPLH);
        if (enNet) {
            this.ensureNode(enNet, LogicState.LOW, timing.tPLH);
        }
        if (rstNet) {
            this.ensureNode(rstNet, LogicState.LOW, timing.tPLH);
        }
    }
    private ensureNode(id: string, defaultState: LogicState, delay: number): void {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, {
                id, state: defaultState, drivers: [],
                propagationDelay: delay, lastChangeTime: 0, lastChangeState: defaultState
            });
        }
    }
    /** Force-set a net level and schedule immediate propagate (DC seed from analog). */
    seedInput(nodeId: string, state: LogicState, atTime: number = 0): void {
        if (!this.nodes.has(nodeId)) {
            this.ensureNode(nodeId, state, 10e-9);
        }
        this.scheduleEvent(atTime, nodeId, state);
    }
    /**
     * DC force-set without event propagation.
     * Avoids false rising-edge clocks on CD4017/DFF when seeding LOGIC_H/L rails.
     */
    forceSetLevel(nodeId: string, state: LogicState): void {
        if (!this.nodes.has(nodeId)) {
            this.ensureNode(nodeId, state, 10e-9);
        }
        const node = this.nodes.get(nodeId);
        if (node === undefined) {
            return;
        }
        node.state = state;
        node.lastChangeState = state;
        node.lastChangeTime = this.currentTime;
    }
    /** After DC seed, align sequential lastClk to current so next real edge works. */
    syncSequentialClocks(): void {
        this.cd4017States.forEach((st: Cd4017State, compId: string) => {
            for (let i = 0; i < this.gates.length; i++) {
                const g = this.gates[i];
                if (g.compId === compId && g.gateType === 'CD4017' && g.inputIds.length > 0) {
                    st.lastClk = this.getState(g.inputIds[0]);
                    break;
                }
            }
        });
        this.dffStates.forEach((st: DffState, compId: string) => {
            for (let i = 0; i < this.gates.length; i++) {
                const g = this.gates[i];
                if (g.compId === compId && g.gateType === 'DFF' && g.inputIds.length >= 2) {
                    st.lastClk = this.getState(g.inputIds[1]);
                    break;
                }
            }
        });
    }
    /** Evaluate every gate once so DC inputs produce valid outputs without an edge. */
    settleCombinational(atTime: number = 0): void {
        this.currentTime = atTime;
        for (let i = 0; i < this.gates.length; i++) {
            const gate = this.gates[i];
            if (gate.gateType === 'DFF' || gate.gateType === 'SHIFT595' || gate.gateType === 'CD4017') {
                continue;
            }
            const output = this.evalGateOutput(gate);
            if (output === LogicState.UNKNOWN || output === LogicState.HIGH_Z) {
                continue;
            }
            // Direct commit for DC settle (instruments need level before next SPICE step)
            this.forceSetLevel(gate.outputId, output);
            this.scheduleEvent(atTime, gate.outputId, output);
        }
        // CD4017 power-on: Q0 high when RST held low (no clock edge)
        this.cd4017States.forEach((st: Cd4017State) => {
            st.count = 0;
            for (let q = 0; q < st.qNetIds.length; q++) {
                const want = q === 0 ? LogicState.HIGH : LogicState.LOW;
                this.forceSetLevel(st.qNetIds[q], want);
                this.scheduleEvent(atTime, st.qNetIds[q], want);
            }
        });
        this.syncSequentialClocks();
    }
    /** Human-readable gate summary for instr_trace. */
    formatGateSummary(maxGates: number = 12): string {
        const parts: string[] = [];
        const limit = Math.min(this.gates.length, maxGates);
        for (let i = 0; i < limit; i++) {
            const g = this.gates[i];
            const inStates: string[] = [];
            for (let j = 0; j < g.inputIds.length; j++) {
                inStates.push(this.logicChar(this.getState(g.inputIds[j])));
            }
            const out = this.logicChar(this.getState(g.outputId));
            parts.push(`${g.gateType}[${inStates.join('')}]→${out}`);
        }
        if (this.gates.length > maxGates) {
            parts.push(`…+${this.gates.length - maxGates}`);
        }
        return parts.join(' ');
    }
    private logicChar(s: LogicState): string {
        if (s === LogicState.HIGH) {
            return 'H';
        }
        if (s === LogicState.LOW) {
            return 'L';
        }
        if (s === LogicState.HIGH_Z) {
            return 'Z';
        }
        return 'X';
    }
    getGateCount(): number {
        return this.gates.length;
    }
    /** Primary gate outputs only (exclude unused CD4017 Q1–Q9 stubs). */
    getPrimaryDrivenNetIds(): string[] {
        const ids: string[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < this.gates.length; i++) {
            const out = this.gates[i].outputId;
            if (out.length > 0 && !seen.has(out)) {
                seen.add(out);
                ids.push(out);
            }
        }
        return ids;
    }
    /** Nets driven by gate outputs (for digital→analog Thevenin stamping). */
    getDrivenNetIds(): string[] {
        const ids: string[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < this.gates.length; i++) {
            const out = this.gates[i].outputId;
            if (out.length > 0 && !seen.has(out)) {
                seen.add(out);
                ids.push(out);
            }
        }
        this.cd4017States.forEach((st: Cd4017State) => {
            for (let q = 0; q < st.qNetIds.length; q++) {
                const id = st.qNetIds[q];
                if (id.length > 0 && !seen.has(id)) {
                    seen.add(id);
                    ids.push(id);
                }
            }
        });
        return ids;
    }
    /** 计算每个门的扇出负载，调整实际延迟 */
    private buildFanoutWeights(): void {
        const drivenBy: Map<string, number> = new Map();
        for (const gate of this.gates) {
            for (const inId of gate.inputIds) {
                drivenBy.set(inId, (drivenBy.get(inId) ?? 0) + 1);
            }
            if (gate.enableId.length > 0) {
                drivenBy.set(gate.enableId, (drivenBy.get(gate.enableId) ?? 0) + 1);
            }
        }
        for (const gate of this.gates) {
            const fanout = drivenBy.get(gate.outputId) ?? 0;
            const loadDelay = fanout * FANOUT_LOAD_FACTOR * 1e9; // ~50ps per fanout
            const delta = loadDelay * 1e-9;
            gate.tPLH += delta;
            gate.tPHL += delta;
        }
    }
    scheduleEvent(time: number, nodeId: string, state: LogicState): void {
        this.eventHeap.push({ time: time, nodeId: nodeId, newState: state });
    }
    processEvents(untilTime: number): Map<string, LogicState> {
        while (!this.eventHeap.isEmpty) {
            const peek = this.eventHeap.peek();
            if (peek === null || peek.time > untilTime) {
                break;
            }
            const evt = this.eventHeap.pop()!;
            this.currentTime = evt.time;
            // ---- 最小脉冲宽度过滤 ----
            const node = this.nodes.get(evt.nodeId);
            if (node) {
                const pulseWidth = evt.time - node.lastChangeTime;
                if (node.lastChangeState !== LogicState.UNKNOWN &&
                    node.lastChangeState !== evt.newState &&
                    pulseWidth > 0 && pulseWidth < MIN_PULSE_WIDTH) {
                    continue; // 毛刺，过滤
                }
                node.lastChangeTime = evt.time;
                node.lastChangeState = evt.newState;
            }
            if (node && node.state !== evt.newState) {
                node.state = evt.newState;
                const toggles = (this.toggleCounts.get(evt.nodeId) ?? 0) + 1;
                this.toggleCounts.set(evt.nodeId, toggles);
                if (toggles > 2 && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                    this.hazardPaths.push({
                        path: `Glitch: ${evt.nodeId} toggled ${toggles}x in ${(evt.time * 1e9).toFixed(1)}ns window`,
                        type: 'glitch',
                        sourceNodeId: evt.nodeId,
                        affectedNodeId: evt.nodeId,
                        toggleCount: toggles
                    });
                }
                this.propagate(evt.nodeId, evt.newState);
            }
        }
        const result = new Map<string, LogicState>();
        this.nodes.forEach((n: DigitalNode, id: string) => result.set(id, n.state));
        return result;
    }
    getState(pinId: string): LogicState {
        return this.nodes.get(pinId)?.state ?? LogicState.UNKNOWN;
    }
    setInput(pinId: string, state: LogicState): void {
        this.scheduleEvent(this.currentTime, pinId, state);
    }
    detectHazards(): HazardReport[] {
        this.nodes.forEach((node: DigitalNode) => {
            if (node.drivers.length > 1) {
                const activeDrivers = node.drivers.filter((d: string) => {
                    const s = this.nodes.get(d)?.state;
                    return s === LogicState.HIGH || s === LogicState.LOW;
                });
                if (activeDrivers.length > 1 && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                    const path = `${activeDrivers.join(' → ')} → ${node.id}`;
                    this.hazardPaths.push({
                        path: `Contention: ${path}`,
                        type: 'contention',
                        sourceNodeId: activeDrivers[0],
                        affectedNodeId: node.id,
                        toggleCount: activeDrivers.length
                    });
                }
            }
        });
        return this.hazardPaths.slice();
    }
    getHazardPaths(): HazardReport[] {
        return this.hazardPaths.slice();
    }
    private resolveTiming(libraryId: string): HcTimingEntry {
        const lib = libraryId.toUpperCase();
        for (let i = 0; i < HC_TIMING_KEYS.length; i++) {
            const key = HC_TIMING_KEYS[i];
            if (lib.includes(key)) {
                return HC_TIMING[key];
            }
        }
        return HC_TIMING['default'];
    }
    private initLogicGate(compId: string, libraryId: string): void {
        const timing = this.resolveTiming(libraryId);
        const tPLH = timing.tPLH;
        const tPHL = timing.tPHL;
        const cin = timing.cin;
        if (libraryId.includes('04')) {
            for (let i = 0; i < 6; i++) {
                this.registerGate(compId, 'NOT', [`${compId}_IN${i}`], `${compId}_OUT${i}`, tPLH, tPHL, cin, false, '');
            }
        }
        else if (libraryId.includes('08')) {
            for (let i = 0; i < 4; i++) {
                this.registerGate(compId, 'AND', [`${compId}_A${i}`, `${compId}_B${i}`], `${compId}_OUT${i}`, tPLH, tPHL, cin, false, '');
            }
        }
        else if (libraryId.includes('32')) {
            for (let i = 0; i < 4; i++) {
                this.registerGate(compId, 'OR', [`${compId}_A${i}`, `${compId}_B${i}`], `${compId}_OUT${i}`, tPLH, tPHL, cin, false, '');
            }
        }
        else if (libraryId.includes('00')) {
            for (let i = 0; i < 4; i++) {
                this.registerGate(compId, 'NAND', [`${compId}_A${i}`, `${compId}_B${i}`], `${compId}_OUT${i}`, tPLH, tPHL, cin, false, '');
            }
        }
        else if (libraryId.includes('02')) {
            for (let i = 0; i < 4; i++) {
                this.registerGate(compId, 'NOR', [`${compId}_A${i}`, `${compId}_B${i}`], `${compId}_OUT${i}`, tPLH, tPHL, cin, false, '');
            }
        }
        else if (libraryId.includes('86')) {
            for (let i = 0; i < 4; i++) {
                this.registerGate(compId, 'XOR', [`${compId}_A${i}`, `${compId}_B${i}`], `${compId}_OUT${i}`, tPLH, tPHL, cin, false, '');
            }
        }
        else if (libraryId.includes('74')) {
            for (let i = 0; i < 2; i++) {
                this.registerGate(compId, 'DFF', [`${compId}_D${i}`, `${compId}_CLK${i}`], `${compId}_Q${i}`, tPLH, tPHL, cin, false, '');
                this.dffStates.set(`${compId}_${i}`, { lastClk: LogicState.LOW, lastDSetupTime: 0, lastClkEdgeTime: 0 });
            }
        }
        else if (libraryId.includes('125') || libraryId.includes('245')) {
            this.registerGate(compId, 'BUF', [`${compId}_IN`], `${compId}_OUT`, tPLH, tPHL, cin, true, `${compId}_OE`);
        }
        else if (libraryId.includes('595')) {
            this.shift595States.set(compId, {
                shiftReg: 0, latch: 0, lastShcp: LogicState.LOW, lastStcp: LogicState.LOW,
                lastDsSetupTime: 0, lastShcpEdgeTime: 0, qNetIds: []
            });
            this.registerGate(compId, 'SHIFT595', [`${compId}_DS`, `${compId}_SHCP`, `${compId}_STCP`], `${compId}_Q0`, tPLH, tPHL, cin, false, '');
            for (let q = 0; q < 8; q++) {
                const qId = `${compId}_Q${q}`;
                if (!this.nodes.has(qId)) {
                    this.nodes.set(qId, { id: qId, state: LogicState.LOW, drivers: [compId], propagationDelay: tPLH, lastChangeTime: 0, lastChangeState: LogicState.LOW });
                }
            }
        }
        else if (libraryId.includes('138')) {
            this.registerGate(compId, 'DEC138', [`${compId}_A0`, `${compId}_A1`, `${compId}_A2`, `${compId}_E`], `${compId}_Y0`, tPLH, tPHL, cin, false, '');
            for (let y = 0; y < 8; y++) {
                const yId = `${compId}_Y${y}`;
                if (!this.nodes.has(yId)) {
                    this.nodes.set(yId, { id: yId, state: LogicState.HIGH, drivers: [compId], propagationDelay: tPLH, lastChangeTime: 0, lastChangeState: LogicState.HIGH });
                }
            }
        }
        else {
            this.registerGate(compId, 'BUF', [`${compId}_IN`], `${compId}_OUT`, tPLH, tPHL, cin, false, '');
        }
        for (const gate of this.gates) {
            if (gate.compId !== compId)
                continue;
            for (const pinId of gate.inputIds) {
                if (!this.nodes.has(pinId)) {
                    this.nodes.set(pinId, { id: pinId, state: LogicState.UNKNOWN, drivers: [], propagationDelay: 0, lastChangeTime: 0, lastChangeState: LogicState.UNKNOWN });
                }
            }
            if (!this.nodes.has(gate.outputId)) {
                this.nodes.set(gate.outputId, { id: gate.outputId, state: LogicState.UNKNOWN, drivers: [gate.compId], propagationDelay: tPLH, lastChangeTime: 0, lastChangeState: LogicState.UNKNOWN });
            }
        }
    }
    private registerGate(compId: string, gateType: string, inputIds: string[], outputId: string, tPLH: number, tPHL: number, inputCap: number, triState: boolean, enableId: string): void {
        this.gates.push({
            compId: compId, gateType: gateType, inputIds: inputIds, outputId: outputId,
            tPLH: tPLH, tPHL: tPHL, inputCap: inputCap, triState: triState, enableId: enableId
        });
    }
    private propagate(nodeId: string, _state: LogicState): void {
        this.evaluateGates(nodeId);
    }
    private evaluateGates(changedNodeId: string): void {
        for (let i = 0; i < this.gates.length; i++) {
            const gate = this.gates[i];
            if (!gate.inputIds.includes(changedNodeId) && gate.enableId !== changedNodeId) {
                continue;
            }
            const output = this.evalGateOutput(gate);
            const outNode = this.nodes.get(gate.outputId);
            if (outNode && outNode.state !== output) {
                const delay = output === LogicState.HIGH ? gate.tPLH : gate.tPHL;
                this.scheduleEvent(this.currentTime + delay, gate.outputId, output);
            }
        }
    }
    private evalGateOutput(gate: LogicGate): LogicState {
        if (gate.triState && gate.enableId.length > 0) {
            const en = this.getState(gate.enableId);
            if (en === LogicState.HIGH)
                return LogicState.HIGH_Z;
        }
        const inputs = gate.inputIds.map((id: string) => this.getState(id));
        if (inputs.some((s: LogicState) => s === LogicState.UNKNOWN))
            return LogicState.UNKNOWN;
        if (inputs.some((s: LogicState) => s === LogicState.HIGH_Z))
            return LogicState.HIGH_Z;
        const vals = inputs.map((s: LogicState) => s === LogicState.HIGH);
        switch (gate.gateType) {
            case 'NOT': return vals[0] ? LogicState.LOW : LogicState.HIGH;
            case 'AND': return vals.every((v: boolean) => v) ? LogicState.HIGH : LogicState.LOW;
            case 'OR': return vals.some((v: boolean) => v) ? LogicState.HIGH : LogicState.LOW;
            case 'NAND': return vals.every((v: boolean) => v) ? LogicState.LOW : LogicState.HIGH;
            case 'NOR': return vals.some((v: boolean) => v) ? LogicState.LOW : LogicState.HIGH;
            case 'XOR': {
                let x = false;
                for (let j = 0; j < vals.length; j++) {
                    x = x !== vals[j];
                }
                return x ? LogicState.HIGH : LogicState.LOW;
            }
            case 'XNOR': {
                let x = false;
                for (let j = 0; j < vals.length; j++) {
                    x = x !== vals[j];
                }
                return x ? LogicState.LOW : LogicState.HIGH;
            }
            case 'BUF': return vals[0] ? LogicState.HIGH : LogicState.LOW;
            case 'DFF': return this.evalDff(gate);
            case 'SHIFT595': return this.evalShift595(gate);
            case 'DEC138': return this.evalDec138(gate);
            case 'CD4017': return this.evalCd4017(gate);
            default: return LogicState.UNKNOWN;
        }
    }
    /** D 触发器 — 带 setup/hold 时序检查 */
    private evalDff(gate: LogicGate): LogicState {
        const dffKey = gate.compId;
        let dff = this.dffStates.get(dffKey);
        if (!dff) {
            dff = { lastClk: LogicState.LOW, lastDSetupTime: 0, lastClkEdgeTime: 0 };
            this.dffStates.set(dffKey, dff);
        }
        const clk = this.getState(gate.inputIds[1]);
        const d = this.getState(gate.inputIds[0]);
        // 上升沿检测
        if (dff.lastClk === LogicState.LOW && clk === LogicState.HIGH) {
            dff.lastClkEdgeTime = this.currentTime;
            const setupDelta = this.currentTime - dff.lastDSetupTime;
            if (setupDelta > 0 && setupDelta < SETUP_TIME_DFF && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                const path = `${gate.compId} D→Q`;
                this.hazardPaths.push({
                    path: `Setup violation: ${path} (Δt=${(setupDelta * 1e12).toFixed(1)}ps < ${SETUP_TIME_DFF * 1e12}ps)`,
                    type: 'setup_violation',
                    sourceNodeId: gate.inputIds[0],
                    affectedNodeId: gate.outputId,
                    toggleCount: 0
                });
            }
            return d === LogicState.HIGH ? LogicState.HIGH : LogicState.LOW;
        }
        // hold check: 时钟沿后数据变化
        if (dff.lastClkEdgeTime > 0) {
            const holdDelta = this.currentTime - dff.lastClkEdgeTime;
            if (holdDelta > 0 && holdDelta < HOLD_TIME_DFF && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                const path = `${gate.compId} D→Q`;
                this.hazardPaths.push({
                    path: `Hold violation: ${path} (Δt=${(holdDelta * 1e12).toFixed(1)}ps < ${HOLD_TIME_DFF * 1e12}ps)`,
                    type: 'hold_violation',
                    sourceNodeId: gate.inputIds[0],
                    affectedNodeId: gate.outputId,
                    toggleCount: 0
                });
            }
        }
        dff.lastClk = clk;
        if (d === LogicState.HIGH || d === LogicState.LOW) {
            dff.lastDSetupTime = this.currentTime;
        }
        return this.getState(gate.outputId); // 保持当前 Q
    }
    private evalShift595(gate: LogicGate): LogicState {
        const state = this.shift595States.get(gate.compId);
        if (!state)
            return LogicState.UNKNOWN;
        const dsNet = gate.inputIds[0];
        const shcpNet = gate.inputIds[1];
        const stcpNet = gate.inputIds[2];
        const ds = this.getState(dsNet) === LogicState.HIGH;
        const shcp = this.getState(shcpNet);
        const stcp = this.getState(stcpNet);
        // DS 数据变化记录 setup 时间
        state.lastDsSetupTime = this.currentTime;
        if (state.lastShcp === LogicState.LOW && shcp === LogicState.HIGH) {
            state.lastShcpEdgeTime = this.currentTime;
            const setupDelta = this.currentTime - state.lastDsSetupTime;
            if (setupDelta > 0 && setupDelta < SETUP_TIME_DFF && this.hazardPaths.length < MAX_HAZARD_HISTORY) {
                this.hazardPaths.push({
                    path: `Setup violation: ${gate.compId} DS→SHCP (Δt=${(setupDelta * 1e12).toFixed(1)}ps)`,
                    type: 'setup_violation',
                    sourceNodeId: dsNet,
                    affectedNodeId: gate.outputId,
                    toggleCount: 0
                });
            }
            state.shiftReg = ((state.shiftReg << 1) | (ds ? 1 : 0)) & 0xFF;
        }
        if (state.lastStcp === LogicState.LOW && stcp === LogicState.HIGH) {
            state.latch = state.shiftReg;
            for (let q = 0; q < 8; q++) {
                const bit = (state.latch >> q) & 1;
                const qId = state.qNetIds[q] ?? `${gate.compId}_Q${q}`;
                this.scheduleEvent(this.currentTime + gate.tPLH, qId, bit ? LogicState.HIGH : LogicState.LOW);
            }
        }
        state.lastShcp = shcp;
        state.lastStcp = stcp;
        return (state.latch & 1) ? LogicState.HIGH : LogicState.LOW;
    }
    private evalCd4017(gate: LogicGate): LogicState {
        const state = this.cd4017States.get(gate.compId);
        if (!state) {
            return LogicState.UNKNOWN;
        }
        const clk = this.getState(gate.inputIds[0]);
        const en = gate.inputIds.length > 1 ? this.getState(gate.inputIds[1]) : LogicState.LOW;
        const rst = gate.inputIds.length > 2 ? this.getState(gate.inputIds[2]) : LogicState.LOW;
        if (rst === LogicState.HIGH) {
            state.count = 0;
            for (let q = 0; q < state.qNetIds.length; q++) {
                this.scheduleEvent(this.currentTime + gate.tPLH, state.qNetIds[q], q === 0 ? LogicState.HIGH : LogicState.LOW);
            }
            state.lastClk = clk;
            return LogicState.HIGH;
        }
        if (state.lastClk === LogicState.LOW && clk === LogicState.HIGH && en !== LogicState.HIGH) {
            state.count = (state.count + 1) % 10;
            for (let q = 0; q < state.qNetIds.length; q++) {
                this.scheduleEvent(this.currentTime + gate.tPLH, state.qNetIds[q], q === state.count ? LogicState.HIGH : LogicState.LOW);
            }
        }
        state.lastClk = clk;
        return state.count === 0 ? LogicState.HIGH : LogicState.LOW;
    }
    private evalDec138(gate: LogicGate): LogicState {
        const enNet = gate.inputIds.length >= 4 ? gate.inputIds[3] : '';
        const enable = enNet ? this.getState(enNet) : LogicState.LOW;
        if (enable === LogicState.HIGH) {
            for (let y = 0; y < 8; y++) {
                const yId = gate.outputId.replace('Y0', `Y${y}`);
                this.scheduleEvent(this.currentTime + gate.tPHL, yId, LogicState.HIGH);
            }
            return LogicState.HIGH;
        }
        const a0 = this.getState(gate.inputIds[0]) === LogicState.HIGH;
        const a1 = gate.inputIds.length >= 2 ? this.getState(gate.inputIds[1]) === LogicState.HIGH : false;
        const a2 = gate.inputIds.length >= 3 ? this.getState(gate.inputIds[2]) === LogicState.HIGH : false;
        const select = (a2 ? 4 : 0) + (a1 ? 2 : 0) + (a0 ? 1 : 0);
        for (let y = 0; y < 8; y++) {
            const yId = gate.outputId.replace('Y0', `Y${y}`);
            const active = y === select ? LogicState.LOW : LogicState.HIGH;
            this.scheduleEvent(this.currentTime + (y === select ? gate.tPHL : gate.tPLH), yId, active);
        }
        return select === 0 ? LogicState.LOW : LogicState.HIGH;
    }
    reset(): void {
        this.nodes.clear();
        this.gates = [];
        this.eventHeap.clear();
        this.currentTime = 0;
        this.hazardPaths = [];
        this.shift595States.clear();
        this.dffStates.clear();
        this.cd4017States.clear();
        this.toggleCounts.clear();
    }
}
